"use client"

import { useRef } from "react"
import { FiDownload, FiUpload, FiCheckCircle, FiAlertCircle } from "react-icons/fi"

import Modal from "@/components/Modal"
import useDbBackupModal from "./useDbBackupModal"
import { useDbBackup } from "./useDbBackup"

const DbBackupModal = () => {
  const modal = useDbBackupModal()
  const backup = useDbBackup()
  const tablesFileInputRef = useRef<HTMLInputElement>(null)
  const filesFileInputRef = useRef<HTMLInputElement>(null)

  const onChange = (open: boolean) => {
    if (!open) {
      backup.reset()
      modal.onClose()
    }
  }

  const handleTablesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) backup.startImportTables(files)
  }

  const handleFilesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) backup.startImportFiles(files)
  }

  const isExportingTables = backup.tablesExportPhase === "exporting"
  const isImportingTables = backup.tablesImportPhase === "importing"
  const isExportingFiles = backup.filesExportPhase === "exporting"
  const isImportingFiles = backup.filesImportPhase === "importing"
  const isBusy = isExportingTables || isImportingTables || isExportingFiles || isImportingFiles

  return (
    <Modal
      isOpen={modal.isOpen}
      onChange={onChange}
      title="My Data Backup"
      description="Export or restore your songs, playlists, and liked songs."
      contentClassName="md:max-w-[520px]">
      <div className="flex flex-col gap-y-6 pb-2">

        {/* ── Tables section ── */}
        <section className="flex flex-col gap-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Tables</h3>

          <button
            onClick={backup.startExportTables}
            disabled={isBusy}
            className="
              flex items-center justify-center gap-x-2
              w-full rounded-md border border-neon/30 bg-elevated px-4 py-2.5
              text-sm font-semibold text-neon
              hover:border-neon/60 hover:bg-elevated/80
              disabled:cursor-not-allowed disabled:opacity-50
              transition
            ">
            <FiDownload size={15} />
            {isExportingTables ? "Exporting tables…" : "Export tables as CSV"}
          </button>

          {isExportingTables && (
            <div className="flex flex-col gap-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  style={{ width: `${backup.tablesExportProgress}%` }}
                  className="h-full rounded-full bg-neon shadow-neon-sm transition-all duration-200"
                />
              </div>
              <p className="text-xs text-neutral-400 text-right">
                {backup.tablesExportDone} / {backup.tablesExportTotal} tables
              </p>
            </div>
          )}

          {backup.tablesExportPhase === "done" && (
            <div className="flex items-center gap-x-2 text-sm text-neon">
              <FiCheckCircle size={14} />
              <span>Tables archive downloaded — check your downloads folder.</span>
            </div>
          )}

          {backup.tablesExportPhase === "error" && (
            <div className="flex items-start gap-x-2 text-sm text-red-400">
              <FiAlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="break-words">{backup.tablesExportError ?? "Tables export failed."}</span>
            </div>
          )}

          <input
            ref={el => {
              tablesFileInputRef.current = el
              backup.tablesImportFileRef.current = el
            }}
            type="file"
            accept=".csv,.tar.gz,.gz,.tgz"
            multiple
            className="hidden"
            onChange={handleTablesFileChange}
          />

          <button
            type="button"
            onClick={() => tablesFileInputRef.current?.click()}
            disabled={isBusy}
            className="
              flex items-center justify-center gap-x-2
              w-full rounded-md border border-neon/30 bg-elevated px-4 py-2.5
              text-sm font-semibold text-neon
              hover:border-neon/60 hover:bg-elevated/80
              disabled:cursor-not-allowed disabled:opacity-50
              transition
            ">
            <FiUpload size={15} />
            {isImportingTables ? "Importing tables…" : "Import tables (.csv or .tar.gz)…"}
          </button>

          {isImportingTables && (
            <div className="flex flex-col gap-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  style={{ width: `${backup.tablesImportProgress}%` }}
                  className="h-full rounded-full bg-neon shadow-neon-sm transition-all duration-200"
                />
              </div>
              <div className="flex items-center justify-between gap-x-2">
                <p className="text-xs text-neutral-400 truncate">{backup.tablesImportLabel}</p>
                <p className="text-xs text-neutral-500 shrink-0">
                  {backup.tablesImportDone} / {backup.tablesImportTotal}
                </p>
              </div>
            </div>
          )}

          {backup.tablesImportResult && backup.tablesImportPhase === "done" && (
            <div className="flex flex-col gap-y-1 rounded-md border border-white/10 bg-elevated/50 p-3">
              {backup.tablesImportResult.tables.map(table => (
                <div key={table.table} className="flex items-center gap-x-2 text-xs text-neutral-300">
                  <FiCheckCircle size={12} className="shrink-0 text-neon" />
                  <span>
                    <span className="font-mono text-white">{table.table}</span>
                    {" → "}
                    {table.rows} rows
                    {table.skipped > 0 && <span className="text-neutral-500"> ({table.skipped} skipped)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {backup.tablesImportPhase === "error" && (
            <div className="flex items-start gap-x-2 text-sm text-red-400">
              <FiAlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="break-words">{backup.tablesImportError ?? "Tables import failed."}</span>
            </div>
          )}
        </section>

        <div className="border-t border-white/10" />

        {/* ── Files section ── */}
        <section className="flex flex-col gap-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Files</h3>

          <label className="flex cursor-pointer items-center gap-x-3 select-none">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={backup.includeImagesFiles}
                onChange={e => backup.setIncludeImagesFiles(e.target.checked)}
                disabled={isBusy}
              />
              <div className="h-4 w-4 rounded border border-white/20 bg-elevated peer-checked:border-neon peer-checked:bg-neon/20 transition-colors" />
              {backup.includeImagesFiles && (
                <FiCheckCircle size={10} className="absolute left-[3px] text-neon pointer-events-none" />
              )}
            </div>
            <span className="text-sm text-neutral-300">Include cover images</span>
          </label>

          <button
            onClick={backup.startExportFiles}
            disabled={isBusy}
            className="
              flex items-center justify-center gap-x-2
              w-full rounded-md border border-neon/30 bg-elevated px-4 py-2.5
              text-sm font-semibold text-neon
              hover:border-neon/60 hover:bg-elevated/80
              disabled:cursor-not-allowed disabled:opacity-50
              transition
            ">
            <FiDownload size={15} />
            {isExportingFiles ? "Exporting files…" : "Export files as archive"}
          </button>

          {isExportingFiles && (
            <div className="flex flex-col gap-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  style={{ width: `${backup.filesExportProgress}%` }}
                  className="h-full rounded-full bg-neon shadow-neon-sm transition-all duration-200"
                />
              </div>
              <p className="text-xs text-neutral-400 text-right">
                {backup.filesExportDone} / {backup.filesExportTotal} files
              </p>
            </div>
          )}

          {backup.filesExportPhase === "done" && (
            <div className="flex items-center gap-x-2 text-sm text-neon">
              <FiCheckCircle size={14} />
              <span>Files archive downloaded — check your downloads folder.</span>
            </div>
          )}

          {backup.filesExportPhase === "error" && (
            <div className="flex items-start gap-x-2 text-sm text-red-400">
              <FiAlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="break-words">{backup.filesExportError ?? "Files export failed."}</span>
            </div>
          )}

          <input
            ref={el => {
              filesFileInputRef.current = el
              backup.filesImportFileRef.current = el
            }}
            type="file"
            accept=".tar.gz,.gz,.tgz"
            className="hidden"
            onChange={handleFilesFileChange}
          />

          <button
            type="button"
            onClick={() => filesFileInputRef.current?.click()}
            disabled={isBusy}
            className="
              flex items-center justify-center gap-x-2
              w-full rounded-md border border-neon/30 bg-elevated px-4 py-2.5
              text-sm font-semibold text-neon
              hover:border-neon/60 hover:bg-elevated/80
              disabled:cursor-not-allowed disabled:opacity-50
              transition
            ">
            <FiUpload size={15} />
            {isImportingFiles ? "Importing files…" : "Import files archive (.tar.gz)…"}
          </button>

          {isImportingFiles && (
            <div className="flex flex-col gap-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  style={{ width: `${backup.filesImportProgress}%` }}
                  className="h-full rounded-full bg-neon shadow-neon-sm transition-all duration-200"
                />
              </div>
              <div className="flex items-center justify-between gap-x-2">
                <p className="text-xs text-neutral-400 truncate">{backup.filesImportLabel}</p>
                <p className="text-xs text-neutral-500 shrink-0">
                  {backup.filesImportDone} / {backup.filesImportTotal}
                </p>
              </div>
            </div>
          )}

          {backup.filesImportResult && backup.filesImportPhase === "done" && (
            <div className="flex flex-col gap-y-1 rounded-md border border-white/10 bg-elevated/50 p-3">
              {backup.filesImportResult.buckets.map(bucket => (
                <div key={bucket.bucket} className="flex items-center gap-x-2 text-xs text-neutral-300">
                  <FiCheckCircle size={12} className="shrink-0 text-neon" />
                  <span>
                    <span className="font-mono text-white">{bucket.bucket}</span>
                    {" → "}
                    {bucket.files} files
                    {bucket.failed > 0 && <span className="text-neutral-500"> ({bucket.failed} skipped)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {backup.filesImportPhase === "error" && (
            <div className="flex items-start gap-x-2 text-sm text-red-400">
              <FiAlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="break-words">{backup.filesImportError ?? "Files import failed."}</span>
            </div>
          )}
        </section>

        <p className="text-sm text-neutral-400">
          Import merges data — existing rows and files are <span className="text-white">replaced</span>, nothing is deleted.
          Import tables before files so restored files are recognized as yours.
        </p>
      </div>
    </Modal>
  )
}

export default DbBackupModal
