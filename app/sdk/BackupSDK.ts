export interface ManifestResult {
  fileCount: number
  totalBytes: number
  estimatedMs: number
  shouldSplit: boolean
  splitIdx: number | null
}

export interface ImportResult {
  tables: { table: string; rows: number; skipped: number }[]
  buckets: { bucket: string; files: number; failed: number }[]
}

export async function getManifest(includeImages: boolean, bytesPerMs?: number): Promise<ManifestResult> {
  const params = new URLSearchParams({ includeImages: String(includeImages) })
  if (bytesPerMs) params.set("bytesPerMs", String(bytesPerMs))

  const res = await fetch(`/api/backup/manifest?${params}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `Manifest failed (${res.status})`)
  }
  return res.json()
}

// How long to spend probing the connection before using whatever was measured so far.
const SPEED_TEST_DURATION_MS = 5_000
// Fallback throughput (bytes/ms) if the probe fails entirely — matches the server's default.
const FALLBACK_BYTES_PER_MS = 8_000

/** Repeatedly downloads a fixed-size payload for ~5s to measure real client download throughput. */
export async function measureConnectionSpeed(): Promise<number> {
  const startMs = performance.now()
  let totalBytes = 0

  try {
    while (performance.now() - startMs < SPEED_TEST_DURATION_MS) {
      const res = await fetch("/api/backup/speed-test", { cache: "no-store" })
      if (!res.ok) break
      const buf = await res.arrayBuffer()
      totalBytes += buf.byteLength
    }
  } catch {
    // Fall through to whatever was measured (or the fallback if nothing succeeded)
  }

  const elapsedMs = performance.now() - startMs
  const bytesPerMs = totalBytes > 0 && elapsedMs > 0 ? totalBytes / elapsedMs : FALLBACK_BYTES_PER_MS

  // Clamp to a sane range: 10 KB/s .. 500 MB/s
  return Math.min(Math.max(bytesPerMs, 10), 500_000)
}

// Budget per chunk: leave 5s headroom below the 60s Vercel limit
const BUDGET_MS = 55_000
// Conservative initial guess when we have no timing data yet
const INITIAL_MS_PER_FILE = 800

interface ChunkResult {
  fileName: string
  blob: Blob
  /** Actual ms spent downloading files (from the server's timing event) */
  elapsedMs: number
  filesProcessed: number
  /** Absolute file index the server actually reached — may be short of the requested `to` */
  nextFrom: number
  /** True if the server hit its internal time budget and stopped before finishing the requested range */
  isStoppedEarly: boolean
}

async function fetchChunk(
  params: URLSearchParams,
  onProgress: (done: number, total: number) => void,
): Promise<ChunkResult> {
  const res = await fetch(`/api/backup/export?${params}`)
  if (!res.ok || !res.body) throw new Error(`Export request failed (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let timing: { elapsedMs: number; filesProcessed: number } | null = null

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
        onProgress(msg.done, msg.total)
      } else if (msg.type === "timing") {
        timing = { elapsedMs: msg.elapsedMs, filesProcessed: msg.filesProcessed }
      } else if (msg.type === "done") {
        const dlRes = await fetch("/api/backup/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: msg.token }),
        })
        if (!dlRes.ok) throw new Error(`Archive fetch failed (${dlRes.status})`)
        return {
          fileName: msg.fileName,
          blob: await dlRes.blob(),
          elapsedMs: timing?.elapsedMs ?? BUDGET_MS,
          filesProcessed: timing?.filesProcessed ?? 1,
          nextFrom: msg.nextFrom,
          isStoppedEarly: Boolean(msg.isStoppedEarly),
        }
      } else if (msg.type === "error") {
        throw new Error(msg.message)
      }
    }
  }

  throw new Error("Export stream ended without a done message")
}

export async function exportWithProgress(opts: {
  includeImages: boolean
  onProgress: (done: number, total: number) => void
  onPhase?: (label: string, chunkIndex: number, totalChunks: number | null) => void
}): Promise<{ archives: { fileName: string; blob: Blob }[] }> {
  const { includeImages, onProgress, onPhase } = opts

  onPhase?.("Testing connection speed…", 0, null)
  const bytesPerMs = await measureConnectionSpeed()

  const manifest = await getManifest(includeImages, bytesPerMs)
  const totalFiles = manifest.fileCount
  const archives: { fileName: string; blob: Blob }[] = []

  const avgBytesPerFile = totalFiles > 0 ? manifest.totalBytes / totalFiles : 0
  let msPerFile = avgBytesPerFile > 0 ? avgBytesPerFile / bytesPerMs : INITIAL_MS_PER_FILE

  let from = 0
  let chunkNum = 1
  let to: number

  if (!manifest.shouldSplit) {
    onPhase?.("Exporting…", 1, 1)
    const params = new URLSearchParams({ includeImages: String(includeImages) })
    const result = await fetchChunk(params, onProgress)
    archives.push({ fileName: result.fileName, blob: result.blob })

    // The manifest's estimate can be wrong — if the server still had to stop
    // early even on the "no split needed" path, fall through into the same
    // chunked loop below to pick up the remaining files instead of returning
    // a truncated archive as if it were complete.
    if (!result.isStoppedEarly) return { archives }

    if (result.filesProcessed > 0) msPerFile = result.elapsedMs / result.filesProcessed
    from = result.nextFrom
    chunkNum = 2
    to = Math.min(from + Math.max(1, Math.ceil(Math.floor(BUDGET_MS / msPerFile) / 2)), totalFiles)
  } else {
    // ── Dynamic chunking ─────────────────────────────────────────────────────
    // Chunk 1: use the manifest's initial splitIdx (sized off the measured
    // connection speed) as the upper bound. After chunk 1 completes we know the
    // real ms/file and recompute all subsequent chunk sizes so they each stay
    // within BUDGET_MS.
    to = Math.min(manifest.splitIdx ?? Math.max(1, Math.floor(BUDGET_MS / msPerFile)), totalFiles)
  }

  while (from < totalFiles) {
    const isFirst = chunkNum === 1
    // We don't know total chunks yet on first iteration — pass null
    onPhase?.(`Exporting part ${chunkNum}…`, chunkNum, null)
    onProgress(0, to - from + (isFirst ? BACKUP_TABLES_COUNT : 0))

    const params = new URLSearchParams({
      includeImages: String(includeImages),
      from: String(from),
      to: String(to),
      chunk: String(chunkNum),
      includeTables: String(isFirst),
    })

    const result = await fetchChunk(params, onProgress)
    archives.push({ fileName: result.fileName, blob: result.blob })

    // Calibrate: compute real ms/file from this chunk's timing
    if (result.filesProcessed > 0) {
      msPerFile = result.elapsedMs / result.filesProcessed
    }

    // Advance from the server's actual stopping point, not the requested `to` —
    // if the server ran out of its time budget it may have processed fewer files
    // than asked, and the next request must pick up exactly where it left off.
    from = result.nextFrom
    chunkNum++

    // How many files can the next chunk safely handle? If the server just stopped
    // early, be more conservative than the raw estimate so the next chunk doesn't
    // immediately hit the same wall.
    const nextChunkSize = Math.max(1, Math.floor(BUDGET_MS / msPerFile))
    to = Math.min(from + (result.isStoppedEarly ? Math.ceil(nextChunkSize / 2) : nextChunkSize), totalFiles)
  }

  return { archives }
}

// Keep BACKUP_TABLES length accessible on the client for progress display
const BACKUP_TABLES_COUNT = 4

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
