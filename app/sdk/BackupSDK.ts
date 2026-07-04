import { getSupabasePublicUrl } from "@/libs/helpers"
import {
  BACKUP_TABLES,
  BackupFileRef,
  addTarEntry,
  finalizeTar,
  gzipBufferClient,
} from "@/app/api/backup/tarClient"

/**
 * Upload a chunk to a Supabase signed upload URL with real progress events, using the same
 * multipart shape as the Supabase SDK's `uploadToSignedUrl` (a `cacheControl` field + the chunk
 * appended under an empty-string key) — but via XHR so we get `upload.onprogress` instead of a
 * single opaque await with no feedback until the whole upload finishes.
 */
function uploadToSignedUrlWithProgress(
  signedUrl: string,
  chunk: Blob,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", signedUrl)
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded, e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        // Supabase's error body is JSON (e.g. {"statusCode":"413","error":"...","message":"..."}) —
        // parse it for a human-readable message instead of dumping the raw JSON string to the user.
        let message = xhr.responseText || xhr.statusText
        try {
          const body = JSON.parse(xhr.responseText)
          if (body?.message) message = body.message
        } catch {
          // Not JSON — fall back to the raw text as-is.
        }
        reject(new Error(`Archive upload failed: ${message}`))
      }
    }
    xhr.onerror = () => reject(new Error("Archive upload failed: network error"))
    const formData = new FormData()
    formData.append("cacheControl", "3600")
    formData.append("", chunk)
    xhr.send(formData)
  })
}

/**
 * Read an NDJSON stream response body line by line, calling `onMessage` for each parsed JSON
 * object as it arrives. Shared by every import route that streams `{type: "..."}` progress
 * messages, so the line-buffering logic exists in exactly one place.
 */
async function readNdjsonStream(response: Response, onMessage: (message: any) => void): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      onMessage(JSON.parse(line))
    }
  }
}

function throwFromErrorMessage(msg: any): never {
  const parts = [msg.stage ? `[${msg.stage}]` : null, msg.message ?? "Import failed", msg.code ? `(code: ${msg.code})` : null, msg.details, msg.hint ? `Hint: ${msg.hint}` : null]
  const detailedError = new Error(parts.filter(Boolean).join(" — "))
  detailedError.name = msg.name ?? "ImportError"
  throw detailedError
}

export interface ImportResult {
  tables: { table: string; rows: number; skipped: number }[]
  buckets: { bucket: string; files: number; failed: number }[]
}

interface ExportManifest {
  tables: Record<string, unknown[]>
  files: BackupFileRef[]
}

// How many storage files to download from Supabase at once. The browser fetches directly from the
// public CDN, so there is no Vercel timeout to respect — this is purely a throughput/politeness knob.
const DOWNLOAD_CONCURRENCY = 5

/**
 * Export the user's data entirely in the browser: fetch backup metadata (table rows + file paths)
 * from the app server, download each storage file directly from Supabase's public CDN, and assemble
 * a single .tar.gz locally. The app server never touches Storage bytes, so there is no 60s function
 * timeout regardless of library size.
 */
export async function exportWithProgress(opts: {
  includeImages: boolean
  onProgress: (done: number, total: number) => void
  onPhase?: (label: string, chunkIndex: number, totalChunks: number | null) => void
}): Promise<{ archives: { fileName: string; blob: Blob }[] }> {
  const { includeImages, onProgress, onPhase } = opts

  onPhase?.("Exporting…", 1, 1)

  // 1. Fetch metadata only (rows + file list) — always fast, never times out.
  const params = new URLSearchParams({ includeImages: String(includeImages) })
  const metaRes = await fetch(`/api/backup/export?${params}`)
  if (!metaRes.ok) {
    const body = await metaRes.json().catch(() => ({}))
    throw new Error(body?.error ?? `Export failed (${metaRes.status})`)
  }
  const { tables, files }: ExportManifest = await metaRes.json()

  const total = BACKUP_TABLES.length + files.length
  let done = 0
  onProgress(done, total)

  const tarChunks: Buffer[] = []
  const contentTypes: Record<string, string> = {}

  // 2. Pack table JSON.
  for (const table of BACKUP_TABLES) {
    addTarEntry(tarChunks, `${table}.json`, Buffer.from(JSON.stringify(tables[table] ?? []), "utf8"))
    done++
    onProgress(done, total)
  }

  // 3. Download storage files directly from Supabase (small concurrency pool) and pack them.
  //    Results are collected then appended in original order so the archive layout is stable.
  const packed: Array<{ file: BackupFileRef; buf: Buffer | null }> = new Array(files.length)
  let nextIdx = 0

  async function worker() {
    while (nextIdx < files.length) {
      const i = nextIdx++
      const file = files[i]
      const url = getSupabasePublicUrl(file.bucket, file.path)
      let buf: Buffer | null = null
      if (url) {
        try {
          const res = await fetch(url)
          if (res.ok) buf = Buffer.from(await res.arrayBuffer())
        } catch {
          // Missing/failed file — skip it (buf stays null), same as the old server path did on error.
        }
      }
      packed[i] = { file, buf }
      done++
      onProgress(done, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, files.length || 1) }, worker))

  for (const { file, buf } of packed) {
    if (!buf) continue
    addTarEntry(tarChunks, `storage/${file.bucket}/${file.path}`, buf)
    contentTypes[`${file.bucket}/${file.path}`] = file.contentType
  }

  addTarEntry(tarChunks, "storage-content-types.json", Buffer.from(JSON.stringify(contentTypes), "utf8"))

  // 4. Finalize + gzip in the browser (CompressionStream) → single archive.
  const tarBuf = finalizeTar(tarChunks)
  const gz = await gzipBufferClient(new Uint8Array(tarBuf))
  const date = new Date().toISOString().slice(0, 10)
  const fileName = `19_backup-${date}.tar.gz`
  const blob = new Blob([gz], { type: "application/gzip" })

  return { archives: [{ fileName, blob }] }
}

// Supabase's project-wide "Global file size limit" is hard-fixed at 50MB on the Free plan and
// cannot be raised from code (see dev_readme-backup.md). Each chunk stays comfortably under that,
// leaving headroom for multipart overhead. Must match MAX_CHUNK_COUNT in import-init/route.ts —
// kept in sync manually since bucket/chunk config lives server-side but the client needs the exact
// numbers to slice the file and produce a precise error message.
const CHUNK_SIZE_BYTES = 40 * 1024 * 1024 // 40mb
const MAX_TOTAL_SIZE_BYTES = 2 * 1024 * 1024 * 1024 // 2gb — 50 chunks at 40MB each

type ImportCursor = {
  stage: "tables" | "storage"
  tableIndex: number
  rowOffset: number
  entryIndex: number
  tableResults: { table: string; rows: number; skipped: number }[]
  bucketStats: Record<string, { files: number; failed: number }>
}

function sliceIntoChunks(file: File): Blob[] {
  const chunks: Blob[] = []
  for (let start = 0; start < file.size; start += CHUNK_SIZE_BYTES) {
    chunks.push(file.slice(start, start + CHUNK_SIZE_BYTES))
  }
  return chunks
}

export async function importArchive(
  file: File,
  onProgress: (done: number, total: number, label: string, phase: "uploading" | "processing") => void,
): Promise<ImportResult> {
  if (file.size > MAX_TOTAL_SIZE_BYTES) {
    const limitMb = Math.round(MAX_TOTAL_SIZE_BYTES / (1024 * 1024))
    const fileMb = (file.size / (1024 * 1024)).toFixed(1)
    throw new Error(`Archive is ${fileMb}MB, which exceeds the ${limitMb}MB import limit.`)
  }

  const chunks = sliceIntoChunks(file)

  // 1. Ask for one signed upload URL per chunk — this bypasses both the Vercel function's request
  //    body size cap (~4.5MB) and Supabase's 50MB global upload limit, since each chunk is its own
  //    small upload and the bytes never pass through our API.
  const initRes = await fetch("/api/backup/import-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunkCount: chunks.length }),
  })
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}))
    throw new Error(body?.error ?? `Failed to start import (${initRes.status})`)
  }
  const { chunkPaths, signedUrls } = await initRes.json()

  // 2. Upload each chunk in turn, reporting one smooth 0-100% progress bar across all of them.
  let uploadedBytes = 0
  for (let index = 0; index < chunks.length; index++) {
    await uploadToSignedUrlWithProgress(signedUrls[index], chunks[index], loaded => {
      const overallLoaded = uploadedBytes + loaded
      onProgress(overallLoaded, file.size, `Uploading archive… ${Math.round((overallLoaded / file.size) * 100)}%`, "uploading")
    })
    uploadedBytes += chunks[index].size
  }

  // 3. Process the uploaded chunks, resuming with a cursor until a "done" message arrives — each
  //    call downloads and concatenates the chunks fresh (no size limit on downloads, only uploads,
  //    which is why the archive is never reassembled into one Storage object) and is budgeted
  //    server-side to stay well under the Vercel function's 60s execution limit.
  onProgress(0, 0, "Processing…", "processing")
  let cursor: ImportCursor = { stage: "tables", tableIndex: 0, rowOffset: 0, entryIndex: 0, tableResults: [], bucketStats: {} }

  while (true) {
    const res = await fetch("/api/backup/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunkPaths, cursor }),
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error ?? `Import failed (${res.status})`)
    }

    let result: ImportResult | null = null
    let nextCursor: ImportCursor | null = null

    await readNdjsonStream(res, msg => {
      if (msg.type === "progress") {
        onProgress(msg.done, msg.total, msg.label ?? "", "processing")
      } else if (msg.type === "continue") {
        nextCursor = msg.cursor
        onProgress(msg.done, msg.total, "Processing…", "processing")
      } else if (msg.type === "done") {
        result = { tables: msg.tables, buckets: msg.buckets }
      } else if (msg.type === "error") {
        throwFromErrorMessage(msg)
      }
    })

    if (result) return result
    if (nextCursor) {
      cursor = nextCursor
      continue
    }
    throw new Error("Import stream ended without a done or continue message")
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
