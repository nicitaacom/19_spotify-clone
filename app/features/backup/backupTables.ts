// One stable import point for the routes and the SDK: project-specific constants/types come from
// ./backupConfig, the pure archive plumbing from ./tarClient. No Node-only imports here — the
// archive is decompressed and parsed entirely in the browser (see dev_readme-backup.md), so the
// old server-side `zlib` helpers and chunked import pipeline are gone.
export {
  BACKUP_TABLES,
  BACKUP_BUCKETS,
  getTableConfig,
  isBackupBucket,
  assertBackupAccess,
  getPublicUrl,
  listFiles,
  isOwnedFile,
} from "./backupConfig"
export type { BackupTableConfig, BackupTableName, BackupBucket, BackupFileRef } from "./backupConfig"

export { addTarEntry, finalizeTar, parseTar, gzipBufferClient, gunzipBufferClient } from "./tarClient"
