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
