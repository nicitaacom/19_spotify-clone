import { BACKUP_TABLES, getPublicUrl, type BackupFileRef, type BackupTableConfig } from "./backupConfig"
import {
  addTarEntry,
  finalizeTar,
  parseTar,
  gzipBufferClient,
  gunzipBufferClient,
} from "./tarClient"
import { toCsv, parseCsv } from "./csvClient"

/**
 * Upload a file/chunk to a Supabase signed upload URL with real progress events, using the same
 * multipart shape as the Supabase SDK's `uploadToSignedUrl` (a `cacheControl` field + the body
 * appended under an empty-string key) — but via XHR so we get `upload.onprogress` instead of a
 * single opaque await with no feedback until the whole upload finishes. `x-upsert: true` mirrors
 * the SDK and lets a re-import overwrite an existing object. The stored content type comes from the
 * Blob's own `type`, so callers pass a correctly-typed Blob.
 */
function uploadToSignedUrlWithProgress(
  signedUrl: string,
  body: Blob,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", signedUrl)
    xhr.setRequestHeader("x-upsert", "true")
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
          const parsed = JSON.parse(xhr.responseText)
          if (parsed?.message) message = parsed.message
        } catch {
          // Not JSON — fall back to the raw text as-is.
        }
        reject(new Error(`Upload failed: ${message}`))
      }
    }
    xhr.onerror = () => reject(new Error("Upload failed: network error"))
    const formData = new FormData()
    formData.append("cacheControl", "3600")
    formData.append("", body)
    xhr.send(formData)
  })
}


// How many storage files to download from Supabase at once. The browser fetches directly from the
// public CDN, so there is no Vercel timeout to respect — this is purely a throughput/politeness knob.
const DOWNLOAD_CONCURRENCY = 5

/**
 * Export the user's table rows only (no storage files) as one .tar.gz containing a .csv per
 * table. Kept separate from file export so a table-only backup never has to touch Storage or
 * wait on file downloads — see dev_readme-backup.md for why tables and files are split.
 */
export async function exportTables(onProgress: (done: number, total: number) => void): Promise<{ fileName: string; blob: Blob }> {
  const rowsRes = await fetch("/api/backup/rows")
  if (!rowsRes.ok) {
    const body = await rowsRes.json().catch(() => ({}))
    throw new Error(body?.error ?? `Failed to fetch table rows (${rowsRes.status})`)
  }
  const { tables }: { tables: Record<string, Record<string, unknown>[]> } = await rowsRes.json()

  const tarChunks: Buffer[] = []
  let done = 0
  onProgress(done, BACKUP_TABLES.length)

  for (const table of BACKUP_TABLES) {
    const csv = toCsv(tables[table.name] ?? [])
    addTarEntry(tarChunks, `${table.name}.csv`, Buffer.from(csv, "utf8"))
    done++
    onProgress(done, BACKUP_TABLES.length)
  }

  const tarBuf = finalizeTar(tarChunks)
  const gz = await gzipBufferClient(new Uint8Array(tarBuf))
  const date = new Date().toISOString().slice(0, 10)
  const fileName = `19_backup-tables-${date}.tar.gz`
  const blob = new Blob([gz], { type: "application/gzip" })

  return { fileName, blob }
}

export interface TablesImportResult {
  tables: { table: string; rows: number; skipped: number }[]
}

const ROW_BATCH_SIZE = 500

/** True for a .tar.gz / .gz archive (by extension), false for a loose .csv file. */
function isArchiveFile(file: File): boolean {
  return file.name.endsWith(".tar.gz") || file.name.endsWith(".gz") || file.name.endsWith(".tgz")
}

/**
 * Collect `<table>.csv` text keyed by table name from one input file — either a .tar.gz archive
 * (decompressed + parsed in the browser) or a single loose .csv (whose table is read from its
 * filename). Archive bytes never reach a server function.
 */
async function readCsvEntries(file: File): Promise<Record<string, string>> {
  if (!isArchiveFile(file)) {
    const table = file.name.replace(/\.csv$/i, "")
    return { [table]: await file.text() }
  }

  let tarBytes: Uint8Array
  try {
    tarBytes = await gunzipBufferClient(new Uint8Array(await file.arrayBuffer()))
  } catch (error: unknown) {
    throw new Error(`${file.name} is not a valid .tar.gz archive: ${error instanceof Error ? error.message : String(error)}`)
  }

  const entries = parseTar(Buffer.from(tarBytes))
  const csvEntries: Record<string, string> = {}
  for (const [name, buf] of Array.from(entries)) {
    if (name.endsWith(".csv")) csvEntries[name.replace(/\.csv$/i, "")] = buf.toString("utf8")
  }
  return csvEntries
}

/**
 * CSV stores every cell as text. On export a `text[]` column comes back a JS array and a jsonb /
 * jsonb[] column comes back an object/array, both of which toCsv writes as JSON. Here we reverse
 * that per the table's config so each row matches the column's Postgres type before upsert:
 *   numericColumns → number, arrayColumns (text[]) → string[], jsonColumns (jsonb/jsonb[]) → parsed.
 * Everything else stays a string (PostgREST coerces timestamp/uuid/enum/bool from text). A null cell
 * stays null. A bad JSON cell throws with the table/column/row so the failure is legible (rule 15).
 */
function coerceRowsForImport(config: BackupTableConfig, rows: Record<string, string | null>[]): Record<string, unknown>[] {
  const parseJsonColumns = new Set([...config.arrayColumns, ...config.jsonColumns])
  const numericColumns = new Set(config.numericColumns)

  return rows.map((row, rowIndex) => {
    const coerced: Record<string, unknown> = { ...row }
    for (const [column, value] of Object.entries(row)) {
      if (value === null) continue
      if (numericColumns.has(column)) {
        coerced[column] = value === "" ? null : Number(value)
      } else if (parseJsonColumns.has(column)) {
        try {
          coerced[column] = JSON.parse(value)
        } catch (error: unknown) {
          throw new Error(`${config.name}.csv row ${rowIndex + 1}, column "${column}": not valid JSON — ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
    return coerced
  })
}

/**
 * Import table rows from CSV files — either .tar.gz archives (from exportTables) or loose .csv
 * files. Multiple inputs are merged; a partial set is fine (only the tables present are imported).
 * Rows are parsed in the browser and POSTed to /api/backup/rows in ≤500-row batches, in FK-safe
 * order (BACKUP_TABLES). The server upserts on each table's primary key and returns real counts.
 */
export async function importTables(
  files: File[],
  onProgress: (done: number, total: number, label: string) => void,
): Promise<TablesImportResult> {
  // Gather CSV text per table across all inputs (later files override earlier ones for a table).
  const csvByTable: Record<string, string> = {}
  for (const file of files) {
    const entries = await readCsvEntries(file)
    Object.assign(csvByTable, entries)
  }

  const tablesToImport = BACKUP_TABLES.filter(table => csvByTable[table.name] !== undefined)
  if (tablesToImport.length === 0) {
    const example = BACKUP_TABLES[0]?.name ?? "table"
    throw new Error(`No table CSV files found — expected files like ${example}.csv, either loose or inside a .tar.gz archive.`)
  }

  const results: TablesImportResult = { tables: [] }
  let done = 0
  onProgress(done, tablesToImport.length, "Restoring tables…")

  for (const table of tablesToImport) {
    onProgress(done, tablesToImport.length, `Restoring ${table.name}…`)

    let rows: Record<string, unknown>[]
    try {
      rows = coerceRowsForImport(table, parseCsv(csvByTable[table.name]))
    } catch (error: unknown) {
      throw new Error(`Failed to parse ${table.name}.csv: ${error instanceof Error ? error.message : String(error)}`)
    }

    let importedRows = 0
    let skippedRows = 0

    for (let start = 0; start < rows.length; start += ROW_BATCH_SIZE) {
      const batch = rows.slice(start, start + ROW_BATCH_SIZE)
      const res = await fetch("/api/backup/rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: table.name, rows: batch }),
      })
      if (!res.ok) {
        const responseText = await res.text().catch(() => "")
        let message: string | undefined
        try {
          const body = JSON.parse(responseText)
          message = [body?.error, body?.code ? `(code: ${body.code})` : null, body?.details, body?.hint ? `Hint: ${body.hint}` : null]
            .filter(Boolean)
            .join(" — ")
        } catch {
          message = responseText || undefined
        }
        throw new Error(`Failed to import ${table.name} (${res.status})${message ? `: ${message}` : ""}`)
      }
      const { rows: rowsUpserted, skipped } = await res.json()
      importedRows += rowsUpserted
      skippedRows += skipped ?? 0
    }

    results.tables.push({ table: table.name, rows: importedRows, skipped: skippedRows })
    done++
    onProgress(done, tablesToImport.length, `Restored ${table.name}`)
  }

  return results
}

/**
 * Export the user's storage files only (song audio + optionally cover images) as one .tar.gz,
 * entirely in the browser: fetch the file list from the server, download each file directly from
 * Supabase's public CDN, and pack them locally. The app server never touches Storage bytes, so
 * there is no 60s function timeout regardless of library size. Kept separate from table export so
 * a files backup never has to fetch or pack table rows. `includeImages` is applied client-side —
 * the server's file list is the same regardless, so a re-export with the box checked never needs
 * a second request.
 */
export async function exportFiles(
  includeImages: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<{ fileName: string; blob: Blob }> {
  const filesRes = await fetch(`/api/backup/files`)
  if (!filesRes.ok) {
    const body = await filesRes.json().catch(() => ({}))
    throw new Error(body?.error ?? `Failed to fetch file list (${filesRes.status})`)
  }
  const { files: allFiles }: { files: BackupFileRef[] } = await filesRes.json()
  const files = includeImages ? allFiles : allFiles.filter(file => file.bucket !== "images")

  let done = 0
  onProgress(done, files.length)

  // Download storage files directly from Supabase (small concurrency pool). Results are collected
  // then packed in original order so the archive layout is stable.
  const packed: Array<{ file: BackupFileRef; buf: Buffer | null }> = new Array(files.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex++
      const file = files[index]
      const url = getPublicUrl(file.bucket, file.path)
      let buf: Buffer | null = null
      try {
        const res = await fetch(url)
        if (res.ok) buf = Buffer.from(await res.arrayBuffer())
      } catch {
        // Missing/failed file — skip it (buf stays null) rather than aborting the whole export.
      }
      packed[index] = { file, buf }
      done++
      onProgress(done, files.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, files.length || 1) }, worker))

  const tarChunks: Buffer[] = []
  const contentTypes: Record<string, string> = {}
  for (const { file, buf } of packed) {
    if (!buf) continue
    addTarEntry(tarChunks, `storage/${file.bucket}/${file.path}`, buf)
    contentTypes[`${file.bucket}/${file.path}`] = file.contentType
  }
  addTarEntry(tarChunks, "storage-content-types.json", Buffer.from(JSON.stringify(contentTypes), "utf8"))

  const tarBuf = finalizeTar(tarChunks)
  const gz = await gzipBufferClient(new Uint8Array(tarBuf))
  const date = new Date().toISOString().slice(0, 10)
  const fileName = `19_backup-files-${date}.tar.gz`
  const blob = new Blob([gz], { type: "application/gzip" })

  return { fileName, blob }
}

export interface FilesImportResult {
  buckets: { bucket: string; files: number; failed: number }[]
}

type ArchiveFile = { bucket: string; path: string; bytes: Uint8Array; contentType: string }
type UploadTarget =
  | { bucket: string; path: string; signedUrl: string }
  | { bucket: string; path: string; skipped: true; reason: string }

// How many signed upload URLs to request per /api/backup/files POST. The bytes never pass through
// that call, so this is only a batching knob — kept ≤ MAX_FILES_PER_REQUEST in files/route.ts.
const URL_BATCH_SIZE = 100

/**
 * Import storage files from a .tar.gz archive — entirely client-side. The browser decompresses and
 * parses the archive locally (no server ever sees the archive bytes, which is what avoids the Vercel
 * out-of-memory / 60s ceilings — see dev_readme-backup.md's Failed iteration #9), asks the server
 * for a signed upload URL per file (issued only for paths the user owns), then PUTs each file's bytes
 * straight to Supabase Storage. Backward-compatible with old combined archives: non-storage entries
 * (table .json / .csv) are simply ignored.
 */
export async function importFiles(
  file: File,
  onProgress: (done: number, total: number, label: string) => void,
): Promise<FilesImportResult> {
  onProgress(0, 0, "Reading archive…")

  let tarBytes: Uint8Array
  try {
    tarBytes = await gunzipBufferClient(new Uint8Array(await file.arrayBuffer()))
  } catch (error: unknown) {
    throw new Error(`${file.name} is not a valid .tar.gz archive: ${error instanceof Error ? error.message : String(error)}`)
  }

  const entries = parseTar(Buffer.from(tarBytes))

  const contentTypesEntry = entries.get("storage-content-types.json")
  const contentTypes: Record<string, string> = contentTypesEntry ? JSON.parse(contentTypesEntry.toString("utf8")) : {}

  // Collect every storage/<bucket>/<path> entry, keeping its raw bytes in browser memory only.
  const archiveFiles: ArchiveFile[] = []
  for (const [name, buf] of Array.from(entries)) {
    if (!name.startsWith("storage/")) continue
    const withoutPrefix = name.slice("storage/".length)
    const slashIndex = withoutPrefix.indexOf("/")
    if (slashIndex === -1) continue
    const bucket = withoutPrefix.slice(0, slashIndex)
    const path = withoutPrefix.slice(slashIndex + 1)
    archiveFiles.push({
      bucket,
      path,
      bytes: new Uint8Array(buf),
      contentType: contentTypes[`${bucket}/${path}`] ?? "application/octet-stream",
    })
  }

  if (archiveFiles.length === 0) {
    throw new Error("No storage files found in the archive — expected storage/songs/… or storage/images/… entries.")
  }

  const byPath = new Map(archiveFiles.map(archiveFile => [`${archiveFile.bucket}/${archiveFile.path}`, archiveFile]))
  const bucketStats: Record<string, { files: number; failed: number }> = {}
  const firstErrorByBucket: Record<string, string> = {}
  let done = 0

  const bumpStat = (bucket: string, key: "files" | "failed") => {
    if (!bucketStats[bucket]) bucketStats[bucket] = { files: 0, failed: 0 }
    bucketStats[bucket][key]++
  }

  for (let start = 0; start < archiveFiles.length; start += URL_BATCH_SIZE) {
    const batch = archiveFiles.slice(start, start + URL_BATCH_SIZE)

    const res = await fetch("/api/backup/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: batch.map(archiveFile => ({ bucket: archiveFile.bucket, path: archiveFile.path })) }),
    })
    if (!res.ok) {
      const responseText = await res.text().catch(() => "")
      let message: string | undefined
      try {
        message = JSON.parse(responseText)?.error
      } catch {
        message = responseText || undefined
      }
      throw new Error(`Failed to prepare file upload (${res.status})${message ? `: ${message}` : ""}`)
    }

    const { results }: { results: UploadTarget[] } = await res.json()

    for (const target of results) {
      const archiveFile = byPath.get(`${target.bucket}/${target.path}`)
      done++

      if ("skipped" in target) {
        bumpStat(target.bucket, "failed")
        continue
      }
      if (!archiveFile) {
        bumpStat(target.bucket, "failed")
        continue
      }

      onProgress(done, archiveFiles.length, `Uploading ${target.bucket}/${target.path.split("/").pop()}…`)
      const uploadBlob = new Blob([archiveFile.bytes], { type: archiveFile.contentType })
      try {
        await uploadToSignedUrlWithProgress(target.signedUrl, uploadBlob, () => {})
        bumpStat(target.bucket, "files")
      } catch (error: unknown) {
        bumpStat(target.bucket, "failed")
        if (!firstErrorByBucket[target.bucket]) firstErrorByBucket[target.bucket] = error instanceof Error ? error.message : String(error)
      }
    }
  }

  // Surface a real error only if EVERY file failed — a partial success still returns counts so the
  // user sees what landed and what didn't, rather than a blanket failure.
  const totalUploaded = Object.values(bucketStats).reduce((sum, stat) => sum + stat.files, 0)
  if (totalUploaded === 0) {
    const firstError = Object.values(firstErrorByBucket)[0]
    throw new Error(firstError ?? "No files were uploaded — every path was skipped (import tables first so the files are recognized as yours).")
  }

  return { buckets: Object.entries(bucketStats).map(([bucket, stat]) => ({ bucket, ...stat })) }
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
