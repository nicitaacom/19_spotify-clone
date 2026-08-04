"use client"

import { useRef, useState } from "react"
import { FiDownload, FiUpload, FiCheckCircle, FiAlertCircle, FiClock } from "react-icons/fi"

import { ModalContainer } from "./ModalContainer"
import useDbBackupModal from "./useDbBackupModal"
import { useDbBackup } from "./useDbBackup"

type BackupMode = "tables" | "files"

export function DbBackupModal() {
  const modal = useDbBackupModal()
  const backup = useDbBackup()
  const [mode, setMode] = useState<BackupMode>("tables")
  const tablesInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  const handleClose = () => {
    backup.reset()
    modal.onClose()
  }

  // Kick off the import, then clear the input so re-selecting the same file fires onChange again.
  const handleTablesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) backup.startImportTables(files)
    e.target.value = ""
  }

  const handleFilesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) backup.startImportFiles(files)
    e.target.value = ""
  }

  const isExportingTables = backup.tablesExportPhase === "exporting"
  const isImportingTables = backup.tablesImportPhase === "importing"
  const isExportingFiles = backup.filesExportPhase === "exporting"
  const isImportingFiles = backup.filesImportPhase === "importing"
  const isBusy = isExportingTables || isImportingTables || isExportingFiles || isImportingFiles
  const showStallNotice = backup.isStalled

  return (
    <ModalContainer
      isOpen={modal.isOpen}
      onClose={handleClose}
      label="My Data Backup"
      description="Back up your rows and your files separately — each has its own export and import."
      closeOnBackdrop={!isBusy}>
      <div className="flex flex-col gap-y-4 min-h-0">
        {/* Mode switch — pick which backup to work with; only that card renders, so the modal never
            has to hold both at once (which is what used to overflow it). */}
        <div className="flex gap-x-2 rounded-lg border border-white/10 bg-elevated/40 p-1">
          {(
            [
              { value: "tables", label: "Tables (rows)" },
              { value: "files", label: "Files (storage)" },
            ] as const
          ).map(option => {
            const isActive = mode === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                disabled={isBusy}
                aria-pressed={isActive}
                className={`
                  flex-1 rounded-md px-3 py-2 text-sm font-semibold transition
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${
                    isActive
                      ? "border border-neon bg-neon/15 text-neon shadow-neon-sm"
                      : "border border-transparent text-neutral-400 hover:text-neutral-200"
                  }
                `}>
                {option.label}
              </button>
            )
          })}
        </div>

        {/* The selected card. A fixed min-height keeps the modal the same size on both tabs (the
            Files card is a checkbox-row taller than Tables), and a bounded max-height makes it
            scroll INSIDE the modal instead of pushing content past the modal border. */}
        <div className="flex flex-col overflow-y-auto pr-1 min-h-[420px] max-h-[60dvh] md:max-h-[calc(85vh-230px)]">
          {/* ═══ Tables (rows / CSV) ═══ */}
          {mode === "tables" && (
            <section className="flex flex-col gap-y-4 rounded-xl border border-white/10 bg-elevated/30 p-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Tables (rows)</h3>
                <p className="text-xs text-neutral-500">Songs, playlists, and liked songs as CSV.</p>
              </div>

              {/* — Export — */}
              <div className="flex flex-col gap-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Export</p>
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
              </div>

              {/* — Import — */}
              <div className="flex flex-col gap-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Import</p>
                <input
                  ref={tablesInputRef}
                  type="file"
                  accept=".csv,.tar.gz,.gz,.tgz"
                  multiple
                  className="hidden"
                  onChange={handleTablesFileChange}
                />

                <button
                  type="button"
                  onClick={() => tablesInputRef.current?.click()}
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
              </div>
            </section>
          )}

          {/* ═══ Files (storage) ═══ */}
          {mode === "files" && (
            <section className="flex flex-col gap-y-4 rounded-xl border border-white/10 bg-elevated/30 p-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Files (storage)</h3>
                <p className="text-xs text-neutral-500">Song audio and cover image files as a .tar.gz archive.</p>
              </div>

              {/* — Export — */}
              <div className="flex flex-col gap-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Export</p>
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
              </div>

              {/* — Import — */}
              <div className="flex flex-col gap-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Import</p>
                <input
                  ref={filesInputRef}
                  type="file"
                  accept=".tar.gz,.gz,.tgz"
                  className="hidden"
                  onChange={handleFilesFileChange}
                />

                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
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
              </div>
            </section>
          )}
        </div>

        {/* "Taking longer than usual" notice — pinned below the scroll area (not inside it), so it
            appears without scrolling and never grows the modal. */}
        {showStallNotice && (
          <div className="flex items-start gap-x-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-2.5 text-xs text-amber-300">
            <FiClock size={13} className="mt-0.5 shrink-0" />
            <span className="break-words">
              Taking longer than usual{backup.activeLabel ? ` — still ${backup.activeLabel}` : ""}. A large library or a
              slow connection can cause this; leave this open while it finishes.
            </span>
          </div>
        )}

        <p className="text-xs text-neutral-400">
          Import merges data — existing rows and files are <span className="text-white">replaced</span>, nothing is
          deleted. Rows or file paths owned by another user are skipped. Import tables before files so restored files are
          recognized as yours.
        </p>
      </div>
    </ModalContainer>
  )
}
