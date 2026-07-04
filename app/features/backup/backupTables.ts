// Re-exports the pure tar builders/parsers + backup table/bucket constants and types from
// ./tarClient, so the server routes import them from one stable place (`@/app/features/backup/
// backupTables`). No Node-only imports here anymore — the archive is now decompressed and parsed
// entirely in the browser (see dev_readme-backup.md), so the old server-side `zlib` gzip/gunzip
// helpers were removed along with the chunked import pipeline.
export {
  BACKUP_TABLES,
  BACKUP_BUCKETS,
  addTarEntry,
  finalizeTar,
  parseTar,
  gzipBufferClient,
} from "./tarClient"
export type { BackupTable, BackupBucket, BackupFileRef } from "./tarClient"
