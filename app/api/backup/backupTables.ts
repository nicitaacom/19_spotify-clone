import zlib from "zlib"

// Pure tar builders/parsers + types live in ./tarClient (no Node deps, browser-safe) and are
// re-exported here so existing server imports (`from "../backupTables"`) keep working unchanged.
export {
  BACKUP_TABLES,
  BACKUP_BUCKETS,
  addTarEntry,
  finalizeTar,
  parseTar,
  gzipBufferClient,
} from "./tarClient"
export type { BackupTable, BackupBucket, BackupFileRef } from "./tarClient"

import type { BackupFileRef } from "./tarClient"

// ~8 MB/s throughput assumption for Supabase Storage downloads
const THROUGHPUT_BYTES_PER_MS = 8000
// 40ms per file overhead (request setup, tar header, etc.)
const OVERHEAD_MS_PER_FILE = 40
// If estimated time exceeds this, split into two halves
export const SPLIT_THRESHOLD_MS = 50_000

export function estimateExportMs(files: BackupFileRef[], bytesPerMs?: number): number {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const throughput = bytesPerMs && bytesPerMs > 0 ? bytesPerMs : THROUGHPUT_BYTES_PER_MS
  return Math.ceil(totalBytes / throughput + files.length * OVERHEAD_MS_PER_FILE)
}

// ── Node gzip (server-only — used by the import route to decompress uploaded archives) ─────────

export async function gzipBuffer(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(input, (err, result) => (err ? reject(err) : resolve(result)))
  })
}

export async function gunzipBuffer(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(input, (err, result) => (err ? reject(err) : resolve(result)))
  })
}
