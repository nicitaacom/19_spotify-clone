import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BACKUP_TABLES, parseTar, gunzipBuffer } from "../backupTables"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TMP_BUCKET = "backups-tmp"
// Leaves headroom below the 60s maxDuration so a call always has time to emit a "continue" message
// and close the stream cleanly, even for slow requests.
const REQUEST_BUDGET_MS = 55_000

type TableResult = { table: string; rows: number; skipped: number }
type BucketResult = { bucket: string; files: number; failed: number }

type ImportCursor = {
  stage: "tables" | "storage"
  tableIndex: number
  rowOffset: number
  entryIndex: number
  tableResults: TableResult[]
  bucketStats: Record<string, { files: number; failed: number }>
}

// POST /api/backup/import  { path, cursor }
//
// `path` points to the reassembled .tar.gz built by import-finalize. Called repeatedly by the
// client, echoing back the cursor from the previous call's "continue" message, until a "done" or
// "error" message arrives. Every call downloads and re-parses the whole archive (cheap buffer work,
// bounded by the total archive size cap) then resumes the actual row upserts / file uploads from
// the cursor — the elapsed-time budget is checked before every individual row batch and before
// every individual file upload, never only between whole tables, so no single unbounded unit of
// work (e.g. one large file's upload) can blow past the budget from inside itself.
export async function POST(req: Request) {
  const { path, cursor } = (await req.json().catch(() => ({}))) as { path?: string; cursor?: ImportCursor }
  if (!path || typeof path !== "string" || !cursor) {
    return NextResponse.json({ error: "Missing path or cursor" }, { status: 400 })
  }

  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  if (!path.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: gzData, error: downloadError } = await supabaseAdmin.storage.from(TMP_BUCKET).download(path)
  if (downloadError || !gzData) {
    return NextResponse.json({ error: downloadError?.message ?? "Failed to fetch reassembled archive" }, { status: 400 })
  }

  let tarBuf: Buffer
  try {
    tarBuf = await gunzipBuffer(Buffer.from(await gzData.arrayBuffer()))
  } catch (error: any) {
    return NextResponse.json({ error: `Invalid archive (gunzip failed): ${error?.message}` }, { status: 400 })
  }

  const entries = parseTar(tarBuf)
  const storageEntries = Array.from(entries.keys()).filter(key => key.startsWith("storage/"))
  const total = BACKUP_TABLES.length + storageEntries.length

  const encoder = new TextEncoder()
  const startedAt = Date.now()
  const overBudget = () => Date.now() - startedAt > REQUEST_BUDGET_MS

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))

      const tableResults: TableResult[] = [...cursor.tableResults]
      const bucketStats: Record<string, { files: number; failed: number }> = { ...cursor.bucketStats }
      let currentStage = "resuming import"

      const doneCount = () => {
        const tablesDone = tableResults.length
        const storageDone = Object.values(bucketStats).reduce((sum, stat) => sum + stat.files + stat.failed, 0)
        return tablesDone + storageDone
      }

      try {
        // ── Restore table rows ───────────────────────────────────────────────
        if (cursor.stage === "tables") {
          for (let tableIndex = cursor.tableIndex; tableIndex < BACKUP_TABLES.length; tableIndex++) {
            const table = BACKUP_TABLES[tableIndex]
            currentStage = `restoring table "${table}"`

            if (overBudget()) {
              send({
                type: "continue",
                cursor: { stage: "tables", tableIndex, rowOffset: 0, entryIndex: 0, tableResults, bucketStats },
                done: doneCount(),
                total,
              })
              controller.close()
              return
            }

            send({ type: "progress", done: doneCount(), total, label: `Restoring ${table}…` })

            const entryBuf = entries.get(`${table}.json`)
            if (!entryBuf) {
              tableResults.push({ table, rows: 0, skipped: 0 })
              continue
            }

            let rows: any[]
            try {
              rows = JSON.parse(entryBuf.toString("utf8"))
            } catch {
              tableResults.push({ table, rows: 0, skipped: 0 })
              continue
            }

            const ownedRows = rows.filter((row: any) => ("user_id" in row ? row.user_id === userId : true))

            if (table === "19_playlist_songs") {
              const { data: userPlaylists } = await supabaseAdmin.from("19_playlists").select("id").eq("user_id", userId)
              const ownedPlaylistIds = new Set((userPlaylists ?? []).map((playlist: any) => playlist.id))
              const safeRows = ownedRows.filter((row: any) => ownedPlaylistIds.has(row.playlist_id))
              const { error } = await supabaseAdmin.from("19_playlist_songs" as any).upsert(safeRows, { onConflict: "playlist_id,song_id" })
              tableResults.push({
                table,
                rows: error ? 0 : safeRows.length,
                skipped: rows.length - safeRows.length + (error ? safeRows.length : 0),
              })
            } else {
              let skipped = rows.length - ownedRows.length
              if (ownedRows.length > 0) {
                const { error } = await supabaseAdmin.from(table as any).upsert(ownedRows)
                if (error) skipped += ownedRows.length
                tableResults.push({ table, rows: error ? 0 : ownedRows.length, skipped })
              } else {
                tableResults.push({ table, rows: 0, skipped })
              }
            }

            send({ type: "progress", done: doneCount(), total, label: `Restored ${table}` })
          }
        }

        // ── Restore storage files ────────────────────────────────────────────
        currentStage = "loading owned song/image paths"
        const { data: userSongs } = await supabaseAdmin.from("19_songs").select("song_path, image_path").eq("user_id", userId)
        const ownedSongPaths = new Set((userSongs ?? []).map((song: any) => song.song_path).filter(Boolean))
        const ownedImagePaths = new Set((userSongs ?? []).map((song: any) => song.image_path).filter(Boolean))

        const contentTypesEntry = entries.get("storage-content-types.json")
        const contentTypes: Record<string, string> = contentTypesEntry
          ? JSON.parse(contentTypesEntry.toString("utf8"))
          : {}

        const startEntryIndex = cursor.stage === "storage" ? cursor.entryIndex : 0

        for (let entryIndex = startEntryIndex; entryIndex < storageEntries.length; entryIndex++) {
          const entryName = storageEntries[entryIndex]
          const withoutPrefix = entryName.slice("storage/".length)
          const slashIndex = withoutPrefix.indexOf("/")
          if (slashIndex === -1) continue

          const bucket = withoutPrefix.slice(0, slashIndex)
          const filePath = withoutPrefix.slice(slashIndex + 1)
          currentStage = `uploading ${bucket}/${filePath}`

          if (!bucketStats[bucket]) bucketStats[bucket] = { files: 0, failed: 0 }

          if (overBudget()) {
            send({
              type: "continue",
              cursor: { stage: "storage", tableIndex: 0, rowOffset: 0, entryIndex, tableResults, bucketStats },
              done: doneCount(),
              total,
            })
            controller.close()
            return
          }

          send({ type: "progress", done: doneCount(), total, label: `Uploading ${bucket}/${filePath.split("/").pop()}…` })

          const data = entries.get(entryName)!
          const isOwned =
            (bucket === "songs" && ownedSongPaths.has(filePath)) ||
            (bucket === "images" && ownedImagePaths.has(filePath))

          if (!isOwned) {
            bucketStats[bucket].failed++
            continue
          }

          const contentType = contentTypes[`${bucket}/${filePath}`] ?? "application/octet-stream"
          const { error } = await supabaseAdmin.storage.from(bucket).upload(filePath, data, { contentType, upsert: true })

          if (error) bucketStats[bucket].failed++
          else bucketStats[bucket].files++

          send({ type: "progress", done: doneCount(), total, label: `Uploaded ${bucket}/${filePath.split("/").pop()}` })
        }

        const bucketResults: BucketResult[] = Object.entries(bucketStats).map(([bucket, stat]) => ({ bucket, ...stat }))
        send({ type: "done", tables: tableResults, buckets: bucketResults })
        controller.close()
        supabaseAdmin.storage.from(TMP_BUCKET).remove([path]).catch(() => {})
      } catch (error: any) {
        send({
          type: "error",
          message: error?.message ?? "Import failed",
          name: error?.name,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          stage: currentStage,
        })
        controller.close()
        supabaseAdmin.storage.from(TMP_BUCKET).remove([path]).catch(() => {})
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  })
}
