import { getSupabasePublicUrl } from "@/libs/helpers"
import {
  BACKUP_TABLES,
  BackupFileRef,
  addTarEntry,
  finalizeTar,
  gzipBufferClient,
} from "@/app/api/backup/tarClient"

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

export async function importArchive(
  file: File,
  onProgress: (done: number, total: number, label: string) => void,
): Promise<ImportResult> {
  const res = await fetch("/api/backup/import", { method: "POST", body: file })

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `Import failed (${res.status})`)
  }

  const reader = res.body.getReader()
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
      const msg = JSON.parse(line)
      if (msg.type === "progress") {
        onProgress(msg.done, msg.total, msg.label ?? "")
      } else if (msg.type === "done") {
        return { tables: msg.tables, buckets: msg.buckets }
      }
    }
  }

  throw new Error("Import stream ended without a done message")
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
