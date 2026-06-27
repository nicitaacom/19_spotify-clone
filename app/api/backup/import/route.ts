import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BACKUP_TABLES, parseTar, gunzipBuffer } from "../backupTables"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type TableResult = { table: string; rows: number; skipped: number }
type BucketResult = { bucket: string; files: number; failed: number }

export async function POST(req: Request) {
  let body: ArrayBuffer
  try {
    body = await req.arrayBuffer()
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 })
  }

  if (!body.byteLength) {
    return NextResponse.json({ error: "Empty request body" }, { status: 400 })
  }

  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const gzBuf = Buffer.from(body)
  let tarBuf: Buffer
  try {
    tarBuf = await gunzipBuffer(gzBuf)
  } catch (e: any) {
    return NextResponse.json({ error: `Invalid archive (gunzip failed): ${e?.message}` }, { status: 400 })
  }

  const entries = parseTar(tarBuf)

  // Count total work units for progress: tables + storage files
  const storageEntries = [...entries.keys()].filter(k => k.startsWith("storage/"))
  const total = BACKUP_TABLES.length + storageEntries.length

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))

      let done = 0
      const tableResults: TableResult[] = []
      const bucketStats: Record<string, { files: number; failed: number }> = {}

      // ── Restore table rows ───────────────────────────────────────────────
      for (const table of BACKUP_TABLES) {
        send({ type: "progress", done, total, label: `Restoring ${table}…` })

        const entryBuf = entries.get(`${table}.json`)
        if (!entryBuf) { done++; continue }

        let rows: any[]
        try { rows = JSON.parse(entryBuf.toString("utf8")) }
        catch { done++; continue }

        const ownedRows = rows.filter((row: any) => ("user_id" in row ? row.user_id === userId : true))

        if (table === "19_playlist_songs") {
          const { data: userPlaylists } = await supabaseAdmin.from("19_playlists").select("id").eq("user_id", userId)
          const ownedPlaylistIds = new Set((userPlaylists ?? []).map((p: any) => p.id))
          const safeRows = ownedRows.filter((row: any) => ownedPlaylistIds.has(row.playlist_id))
          const { error } = await supabaseAdmin.from("19_playlist_songs" as any).upsert(safeRows, { onConflict: "playlist_id,song_id" })
          tableResults.push({ table, rows: error ? 0 : safeRows.length, skipped: rows.length - safeRows.length + (error ? safeRows.length : 0) })
        } else {
          let skipped = rows.length - ownedRows.length
          if (ownedRows.length > 0) {
            const { error } = await supabaseAdmin.from(table as any).upsert(ownedRows)
            if (error) { skipped += ownedRows.length; tableResults.push({ table, rows: 0, skipped }); done++; continue }
          }
          tableResults.push({ table, rows: ownedRows.length, skipped })
        }

        done++
        send({ type: "progress", done, total, label: `Restored ${table}` })
      }

      // ── Restore storage files ────────────────────────────────────────────
      const { data: userSongs } = await supabaseAdmin.from("19_songs").select("song_path, image_path").eq("user_id", userId)
      const ownedSongPaths = new Set((userSongs ?? []).map((s: any) => s.song_path).filter(Boolean))
      const ownedImagePaths = new Set((userSongs ?? []).map((s: any) => s.image_path).filter(Boolean))

      const contentTypesEntry = entries.get("storage-content-types.json")
      const contentTypes: Record<string, string> = contentTypesEntry
        ? JSON.parse(contentTypesEntry.toString("utf8"))
        : {}

      for (const entryName of storageEntries) {
        const data = entries.get(entryName)!
        const withoutPrefix = entryName.slice("storage/".length)
        const slashIdx = withoutPrefix.indexOf("/")
        if (slashIdx === -1) { done++; continue }

        const bucket = withoutPrefix.slice(0, slashIdx)
        const filePath = withoutPrefix.slice(slashIdx + 1)

        if (!bucketStats[bucket]) bucketStats[bucket] = { files: 0, failed: 0 }

        send({ type: "progress", done, total, label: `Uploading ${bucket}/${filePath.split("/").pop()}…` })

        const isOwned =
          (bucket === "songs" && ownedSongPaths.has(filePath)) ||
          (bucket === "images" && ownedImagePaths.has(filePath))

        if (!isOwned) {
          bucketStats[bucket].failed++
          done++
          continue
        }

        const contentType = contentTypes[`${bucket}/${filePath}`] ?? "application/octet-stream"
        const { error } = await supabaseAdmin.storage.from(bucket).upload(filePath, data, { contentType, upsert: true })

        if (error) bucketStats[bucket].failed++
        else bucketStats[bucket].files++

        done++
        send({ type: "progress", done, total, label: `Uploaded ${bucket}/${filePath.split("/").pop()}` })
      }

      const bucketResults: BucketResult[] = Object.entries(bucketStats).map(([bucket, s]) => ({ bucket, ...s }))
      send({ type: "done", tables: tableResults, buckets: bucketResults })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  })
}
