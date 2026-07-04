"use client"

import { useRef } from "react"
import { FiDownload, FiUpload, FiCheckCircle, FiAlertCircle } from "react-icons/fi"

import Modal from "./Modal"
import useDbBackupModal from "@/hooks/useDbBackupModal"
import { useDbBackup } from "@/hooks/useDbBackup"

const DbBackupModal = () => {
  const modal = useDbBackupModal()
  const backup = useDbBackup()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onChange = (open: boolean) => {
    if (!open) {
      backup.reset()
      modal.onClose()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) backup.startImport(files)
  }

  const isExporting = backup.exportPhase === "exporting"
  const isImporting = backup.importPhase === "uploading" || backup.importPhase === "processing"

  return (
    <Modal
      isOpen={modal.isOpen}
      onChange={onChange}
      title="My Data Backup"
      description="Export or restore your songs, playlists, and liked songs."
      contentClassName="md:max-w-[520px]">
      <div className="flex flex-col gap-y-6 pb-2">

        {/* ── Export section ── */}
        <section className="flex flex-col gap-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Export</h3>

          {/* Include images checkbox */}
          <label className="flex cursor-pointer items-center gap-x-3 select-none">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={backup.includeImages}
                onChange={e => backup.setIncludeImages(e.target.checked)}
                disabled={isExporting}
              />
              <div className="h-4 w-4 rounded border border-white/20 bg-elevated peer-checked:border-neon peer-checked:bg-neon/20 transition-colors" />
              {backup.includeImages && (
                <FiCheckCircle size={10} className="absolute left-[3px] text-neon pointer-events-none" />
              )}
            </div>
            <span className="text-sm text-neutral-300">Include cover images</span>
          </label>

          <button
            onClick={backup.startExport}
            disabled={isExporting || isImporting}
            className="
              flex items-center justify-center gap-x-2
              w-full rounded-md bg-neon px-4 py-2.5
              text-sm font-bold text-black
              hover:bg-neon-strong
              disabled:cursor-not-allowed disabled:opacity-50
              transition
            ">
            <FiDownload size={15} />
            {isExporting ? backup.exportLabel : "Export my data"}
          </button>

          {/* Export progress */}
          {isExporting && (
            <div className="flex flex-col gap-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  style={{ width: `${backup.exportProgress}%` }}
                  className="h-full rounded-full bg-neon shadow-neon-sm transition-all duration-200"
                />
              </div>
              <p className="text-xs text-neutral-400 text-right">
                {backup.exportDone} / {backup.exportTotal} files
              </p>
            </div>
          )}

          {backup.exportPhase === "done" && (
            <div className="flex items-center gap-x-2 text-sm text-neon">
              <FiCheckCircle size={14} />
              <span>Archive downloaded — check your downloads folder.</span>
            </div>
          )}

          {backup.exportPhase === "error" && (
            <div className="flex items-center gap-x-2 text-sm text-red-400">
              <FiAlertCircle size={14} />
              <span>Export failed. Try again.</span>
            </div>
          )}
        </section>

        <div className="border-t border-white/10" />

        {/* ── Import section ── */}
        <section className="flex flex-col gap-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Import</h3>

          <input
            ref={el => {
              fileInputRef.current = el
              backup.importFileRef.current = el
            }}
            type="file"
            accept=".tar.gz"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isExporting}
            className="
              flex items-center justify-center gap-x-2
              w-full rounded-md border border-neon/30 bg-elevated px-4 py-2.5
              text-sm font-semibold text-neon
              hover:border-neon/60 hover:bg-elevated/80
              disabled:cursor-not-allowed disabled:opacity-50
              transition
            ">
            <FiUpload size={15} />
            {isImporting ? "Importing…" : "Choose .tar.gz file(s)…"}
          </button>

          {/* Import progress */}
          {(backup.importPhase === "uploading" || backup.importPhase === "processing") && (
            <div className="flex flex-col gap-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  style={{ width: `${backup.importProgress}%` }}
                  className="h-full rounded-full bg-neon shadow-neon-sm transition-all duration-200"
                />
              </div>
              <div className="flex items-center justify-between gap-x-2">
                <p className="text-xs text-neutral-400 truncate">{backup.importLabel}</p>
                {backup.importPhase === "processing" && (
                  <p className="text-xs text-neutral-500 shrink-0">
                    {backup.importDone} / {backup.importTotal}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Import results */}
          {backup.importResult && backup.importPhase === "done" && (
            <div className="flex flex-col gap-y-1 rounded-md border border-white/10 bg-elevated/50 p-3">
              {backup.importResult.tables.map(t => (
                <div key={t.table} className="flex items-center gap-x-2 text-xs text-neutral-300">
                  <FiCheckCircle size={12} className="shrink-0 text-neon" />
                  <span>
                    <span className="font-mono text-white">{t.table}</span>
                    {" → "}
                    {t.rows} rows
                    {t.skipped > 0 && <span className="text-neutral-500"> ({t.skipped} skipped)</span>}
                  </span>
                </div>
              ))}
              {backup.importResult.buckets.map(b => (
                <div key={b.bucket} className="flex items-center gap-x-2 text-xs text-neutral-300">
                  <FiCheckCircle size={12} className="shrink-0 text-neon" />
                  <span>
                    <span className="font-mono text-white">{b.bucket}</span>
                    {" → "}
                    {b.files} files
                    {b.failed > 0 && <span className="text-neutral-500"> ({b.failed} failed)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {backup.importPhase === "error" && (
            <div className="flex items-start gap-x-2 text-sm text-red-400">
              <FiAlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="break-words">{backup.importError ?? "Import failed. Try again."}</span>
            </div>
          )}

          <p className="text-sm text-neutral-400">
            Import merges data — existing rows are <span className="text-white">replaced</span>, nothing is deleted.
          </p>
        </section>
      </div>
    </Modal>
  )
}

export default DbBackupModal
