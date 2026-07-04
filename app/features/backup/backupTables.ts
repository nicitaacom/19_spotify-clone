import zlib from "zlib"

// SERVER-ONLY (imports Node `zlib`). Never import this from a client component or from BackupSDK —
// import the pure parts from ./tarClient / ./csvClient directly instead. The API routes import the
// pure re-exports below plus the Node gzip helpers from here.
//
// Pure tar builders/parsers + types live in ./tarClient (no Node deps, browser-safe) and are
// re-exported here so the server routes get them from one place.
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
