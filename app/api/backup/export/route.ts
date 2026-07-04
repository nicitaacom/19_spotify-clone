import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BACKUP_TABLES, BackupFileRef, addTarEntry, finalizeTar, gzipBuffer } from "../backupTables"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Hard stop for in-request work, safely under the 60s function limit. The loop below
// checks elapsed time before each file download and returns whatever it has packed so
// far once this budget is spent — this is what actually prevents the timeout, since it
// no longer depends on the client having guessed the right chunk size in advance.
const SERVER_BUDGET_MS = 50_000

// Short-lived in-memory store: token → built archive buffer (expires in 2 min, single-use)
const archiveCache = new Map<string, { buf: Buffer; fileName: string; expiresAt: number }>()

// POST /api/backup/export  { token }  → raw .tar.gz binary
export async function POST(req: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { token } = await req.json().catch(() => ({}))
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const entry = archiveCache.get(token)
  if (!entry || entry.expiresAt < Date.now()) {
    archiveCache.delete(token)
    return NextResponse.json({ error: "Token expired or not found" }, { status: 404 })
  }

  archiveCache.delete(token)

  return new Response(entry.buf, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${entry.fileName}"`,
      "Content-Length": String(entry.buf.length),
      "Cache-Control": "no-store",
    },
  })
}

// GET /api/backup/export?includeImages=true[&from=N&to=M&chunk=K&includeTables=false]
//
// Params:
//   from / to         — half-open file range [from, to). Omit for all files.
//   chunk             — chunk number suffix for the filename (1, 2, 3…). Omit for single archive.
//   includeTables     — whether to pack table JSON + content-types. Default true. Only first chunk does this.
//
// Streams NDJSON:
//   { type:"progress", done:N, total:M }
//   { type:"timing", elapsedMs:N, filesProcessed:M }   ← actual wall time, lets client compute next chunk size
//   { type:"done", token, fileName }
export async function GET(req: Request) {
  const requestStartMs = Date.now()
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const includeImages = searchParams.get("includeImages") !== "false"
  const from = searchParams.has("from") ? parseInt(searchParams.get("from")!, 10) : null
  const to = searchParams.has("to") ? parseInt(searchParams.get("to")!, 10) : null
  const chunk = searchParams.has("chunk") ? parseInt(searchParams.get("chunk")!, 10) : null
  const includeTables = searchParams.get("includeTables") !== "false"

  // ── Fetch table data ───────────────────────────────────────────────────────
  const tableData: Record<string, unknown[]> = {}

  for (const table of BACKUP_TABLES) {
    if (table === "19_playlist_songs") {
      const { data: playlists } = await supabaseAdmin.from("19_playlists").select("id").eq("user_id", userId)
      const playlistIds = (playlists ?? []).map((p: any) => p.id)
      if (playlistIds.length === 0) { tableData[table] = []; continue }
      const { data, error } = await supabaseAdmin.from("19_playlist_songs").select("*").in("playlist_id", playlistIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      tableData[table] = data ?? []
    } else if (table === "19_liked_songs") {
      const { data, error } = await supabaseAdmin.from("19_liked_songs").select("*").eq("user_id", userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      tableData[table] = data ?? []
    } else {
      const { data, error } = await (supabaseAdmin.from(table as any).select("*") as any).eq("user_id", userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      tableData[table] = data ?? []
    }
  }

  // ── Collect file refs and apply range ─────────────────────────────────────
  const songs = (tableData["19_songs"] ?? []) as Array<{ song_path?: string | null; image_path?: string | null }>
  const allFiles: BackupFileRef[] = []
  for (const song of songs) {
    if (song.song_path) allFiles.push({ bucket: "songs", path: song.song_path, size: 0, contentType: "audio/mpeg" })
    if (includeImages && song.image_path) allFiles.push({ bucket: "images", path: song.image_path, size: 0, contentType: "image/jpeg" })
  }

  const rangeStart = from ?? 0
  const filesToProcess = (from !== null && to !== null) ? allFiles.slice(from, to) : allFiles

  // ── Stream NDJSON ──────────────────────────────────────────────────────────
  const encoder = new TextEncoder()
  const total = filesToProcess.length + (includeTables ? BACKUP_TABLES.length : 0)

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"))

      try {
        const tarChunks: Buffer[] = []
        const contentTypes: Record<string, string> = {}
        let done = 0
        let filesProcessed = 0
        let isStoppedEarly = false
        const startMs = Date.now()

        // Tables JSON (first chunk only)
        if (includeTables) {
          for (const table of BACKUP_TABLES) {
            addTarEntry(tarChunks, `${table}.json`, Buffer.from(JSON.stringify(tableData[table] ?? []), "utf8"))
            done++
            send({ type: "progress", done, total })
          }
        }

        // Storage files — bail out before the request risks hitting the platform's
        // hard timeout. Whatever hasn't been packed yet is picked up by the next
        // chunk request, starting from `nextFrom` reported in the "done" message.
        for (const file of filesToProcess) {
          if (Date.now() - requestStartMs > SERVER_BUDGET_MS) {
            isStoppedEarly = true
            break
          }

          const { data, error } = await supabaseAdmin.storage.from(file.bucket).download(file.path)
          if (!error && data) {
            const buf = Buffer.from(await data.arrayBuffer())
            addTarEntry(tarChunks, `storage/${file.bucket}/${file.path}`, buf)
            contentTypes[`${file.bucket}/${file.path}`] = file.contentType
          }
          filesProcessed++
          done++
          send({ type: "progress", done, total })
        }

        // Emit actual wall time so the client can calibrate the next chunk size
        send({ type: "timing", elapsedMs: Date.now() - startMs, filesProcessed })

        if (includeTables) {
          addTarEntry(tarChunks, "storage-content-types.json", Buffer.from(JSON.stringify(contentTypes), "utf8"))
        }

        const gzBuf = await gzipBuffer(finalizeTar(tarChunks))
        const date = new Date().toISOString().slice(0, 10)
        const suffix = chunk !== null ? `-part${chunk}` : ""
        const fileName = `19_backup-${date}${suffix}.tar.gz`
        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        archiveCache.set(token, { buf: gzBuf, fileName, expiresAt: Date.now() + 120_000 })

        // nextFrom tells the client exactly where this chunk actually stopped —
        // it may be less than the originally requested `to` if we ran out of budget.
        const nextFrom = rangeStart + filesProcessed
        send({ type: "done", fileName, token, nextFrom, isStoppedEarly })
        controller.close()
      } catch (err: any) {
        send({ type: "error", message: err?.message ?? "Export failed" })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  })
}
