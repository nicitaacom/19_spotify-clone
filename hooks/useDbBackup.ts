import { useState, useRef, useEffect } from "react"
import { toast } from "react-hot-toast"
import { exportWithProgress, importArchive, downloadBlob, ImportResult } from "@/app/sdk/BackupSDK"

type ExportPhase = "idle" | "exporting" | "done" | "error"
type ImportPhase = "idle" | "uploading" | "processing" | "done" | "error"

export function useDbBackup() {
  // Export state
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle")
  const [exportDone, setExportDone] = useState(0)
  const [exportTotal, setExportTotal] = useState(0)
  const [exportLabel, setExportLabel] = useState("Exporting…")
  const [includeImages, setIncludeImages] = useState(true)

  // Import state
  const [importPhase, setImportPhase] = useState<ImportPhase>("idle")
  const [importDone, setImportDone] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importLabel, setImportLabel] = useState("")
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)

  const importProgress = importTotal > 0 ? Math.round((importDone / importTotal) * 100) : 0

  const exportProgress = exportTotal > 0 ? Math.round((exportDone / exportTotal) * 100) : 0

  const isBusy = exportPhase === "exporting" || importPhase === "uploading" || importPhase === "processing"

  useEffect(() => {
    if (!isBusy) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isBusy])

  async function startExport() {
    setExportPhase("exporting")
    setExportDone(0)
    setExportTotal(0)
    setExportLabel("Exporting…")

    try {
      const { archives } = await exportWithProgress({
        includeImages,
        onProgress: (done, total) => {
          setExportDone(done)
          setExportTotal(total)
        },
        onPhase: (label) => {
          setExportLabel(label)
          setExportDone(0)
          setExportTotal(0)
        },
      })

      for (const { blob, fileName } of archives) {
        downloadBlob(blob, fileName)
      }

      toast.success("Backup downloaded!")

      setExportPhase("done")
    } catch (err: any) {
      setExportPhase("error")
      toast.error(err?.message ?? "Export failed")
    }
  }

  async function startImport(files: FileList) {
    if (!files.length) return
    setImportPhase("uploading")
    setImportDone(0)
    setImportTotal(0)
    setImportLabel("Uploading archive…")
    setImportResult(null)

    const allResults: ImportResult = { tables: [], buckets: [] }

    try {
      for (let i = 0; i < files.length; i++) {
        if (files.length > 1) setImportLabel(`Archive ${i + 1} of ${files.length}…`)
        const result = await importArchive(files[i], (done, total, label) => {
          setImportDone(done)
          setImportTotal(total)
          setImportLabel(label)
        })
        for (const t of result.tables) {
          const existing = allResults.tables.find(x => x.table === t.table)
          if (existing) { existing.rows += t.rows; existing.skipped += t.skipped }
          else allResults.tables.push({ ...t })
        }
        for (const b of result.buckets) {
          const existing = allResults.buckets.find(x => x.bucket === b.bucket)
          if (existing) { existing.files += b.files; existing.failed += b.failed }
          else allResults.buckets.push({ ...b })
        }
      }

      setImportResult(allResults)
      setImportPhase("done")

      const totalRows = allResults.tables.reduce((s, t) => s + t.rows, 0)
      const totalFiles = allResults.buckets.reduce((s, b) => s + b.files, 0)
      toast.success(`Restored ${totalRows} rows and ${totalFiles} files.`)
    } catch (err: any) {
      setImportPhase("error")
      toast.error(err?.message ?? "Import failed")
    }
  }

  function reset() {
    setExportPhase("idle")
    setExportDone(0)
    setExportTotal(0)
    setExportLabel("Exporting…")
    setImportPhase("idle")
    setImportDone(0)
    setImportTotal(0)
    setImportLabel("")
    setImportResult(null)
    if (importFileRef.current) importFileRef.current.value = ""
  }

  return {
    exportPhase, exportProgress, exportDone, exportTotal, exportLabel,
    includeImages, setIncludeImages, startExport,
    importPhase, importProgress, importDone, importTotal, importLabel,
    importResult, importFileRef, startImport,
    reset,
  }
}
