import { useState, useRef, useEffect } from "react"
import { toast } from "react-hot-toast"
import { exportTables, exportFiles, importTables, importFiles, downloadBlob, TablesImportResult, FilesImportResult } from "./BackupSDK"

type TablesExportPhase = "idle" | "exporting" | "done" | "error"
type TablesImportPhase = "idle" | "importing" | "done" | "error"
type FilesExportPhase = "idle" | "exporting" | "done" | "error"
type FilesImportPhase = "idle" | "importing" | "done" | "error"

// How long with no progress update before the UI shows "taking longer than usual".
const STALL_THRESHOLD_MS = 10_000

export function useDbBackup() {
  // Tables export state
  const [tablesExportPhase, setTablesExportPhase] = useState<TablesExportPhase>("idle")
  const [tablesExportDone, setTablesExportDone] = useState(0)
  const [tablesExportTotal, setTablesExportTotal] = useState(0)
  const [tablesExportError, setTablesExportError] = useState<string | null>(null)

  // Tables import state
  const [tablesImportPhase, setTablesImportPhase] = useState<TablesImportPhase>("idle")
  const [tablesImportDone, setTablesImportDone] = useState(0)
  const [tablesImportTotal, setTablesImportTotal] = useState(0)
  const [tablesImportLabel, setTablesImportLabel] = useState("")
  const [tablesImportResult, setTablesImportResult] = useState<TablesImportResult | null>(null)
  const [tablesImportError, setTablesImportError] = useState<string | null>(null)

  // Files export state
  const [filesExportPhase, setFilesExportPhase] = useState<FilesExportPhase>("idle")
  const [filesExportDone, setFilesExportDone] = useState(0)
  const [filesExportTotal, setFilesExportTotal] = useState(0)
  const [filesExportError, setFilesExportError] = useState<string | null>(null)
  const [includeImagesFiles, setIncludeImagesFiles] = useState(true)

  // Files import state
  const [filesImportPhase, setFilesImportPhase] = useState<FilesImportPhase>("idle")
  const [filesImportDone, setFilesImportDone] = useState(0)
  const [filesImportTotal, setFilesImportTotal] = useState(0)
  const [filesImportLabel, setFilesImportLabel] = useState("")
  const [filesImportResult, setFilesImportResult] = useState<FilesImportResult | null>(null)
  const [filesImportError, setFilesImportError] = useState<string | null>(null)

  // "Taking longer than usual" watchdog: bump lastProgressRef on every progress event; a 1s ticker
  // flips isStalled on once nothing has advanced for STALL_THRESHOLD_MS, and back off on the next
  // progress event. Marks stall detection so a genuinely stuck operation is distinguishable from a
  // slow-but-alive one.
  const [isStalled, setIsStalled] = useState(false)
  const lastProgressRef = useRef(Date.now())
  const bumpProgress = () => {
    lastProgressRef.current = Date.now()
    setIsStalled(false)
  }

  const isBusy =
    tablesExportPhase === "exporting" ||
    tablesImportPhase === "importing" ||
    filesExportPhase === "exporting" ||
    filesImportPhase === "importing"

  useEffect(() => {
    if (!isBusy) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isBusy])

  useEffect(() => {
    if (!isBusy) {
      setIsStalled(false)
      return
    }
    const timer = setInterval(() => {
      setIsStalled(Date.now() - lastProgressRef.current > STALL_THRESHOLD_MS)
    }, 1000)
    return () => clearInterval(timer)
  }, [isBusy])

  async function startExportTables() {
    setTablesExportPhase("exporting")
    setTablesExportDone(0)
    setTablesExportTotal(0)
    setTablesExportError(null)
    bumpProgress()

    try {
      const { fileName, blob } = await exportTables((done, total) => {
        bumpProgress()
        setTablesExportDone(done)
        setTablesExportTotal(total)
      })
      downloadBlob(blob, fileName)
      toast.success("Tables backup downloaded!")
      setTablesExportPhase("done")
    } catch (err: any) {
      setTablesExportPhase("error")
      const message = err?.message ?? "Tables export failed"
      setTablesExportError(message)
      toast.error(message)
    }
  }

  async function startExportFiles() {
    setFilesExportPhase("exporting")
    setFilesExportDone(0)
    setFilesExportTotal(0)
    setFilesExportError(null)
    bumpProgress()

    try {
      const { fileName, blob } = await exportFiles(includeImagesFiles, (done, total) => {
        bumpProgress()
        setFilesExportDone(done)
        setFilesExportTotal(total)
      })
      downloadBlob(blob, fileName)
      toast.success("Files backup downloaded!")
      setFilesExportPhase("done")
    } catch (err: any) {
      setFilesExportPhase("error")
      const message = err?.message ?? "Files export failed"
      setFilesExportError(message)
      toast.error(message)
    }
  }

  async function startImportFiles(files: FileList) {
    if (!files.length) return
    setFilesImportPhase("importing")
    setFilesImportDone(0)
    setFilesImportTotal(0)
    setFilesImportLabel("Reading archive…")
    setFilesImportResult(null)
    setFilesImportError(null)
    bumpProgress()

    try {
      const result = await importFiles(files[0], (done, total, label) => {
        bumpProgress()
        setFilesImportDone(done)
        setFilesImportTotal(total)
        setFilesImportLabel(label)
      })
      setFilesImportResult(result)
      setFilesImportPhase("done")

      const totalFiles = result.buckets.reduce((sum, bucket) => sum + bucket.files, 0)
      toast.success(`Restored ${totalFiles} files.`)
    } catch (err: any) {
      setFilesImportPhase("error")
      const message = err?.message ?? "Files import failed"
      setFilesImportError(message)
      toast.error(message)
    }
  }

  async function startImportTables(files: FileList) {
    if (!files.length) return
    setTablesImportPhase("importing")
    setTablesImportDone(0)
    setTablesImportTotal(0)
    setTablesImportLabel("Reading files…")
    setTablesImportResult(null)
    setTablesImportError(null)
    bumpProgress()

    try {
      const result = await importTables(Array.from(files), (done, total, label) => {
        bumpProgress()
        setTablesImportDone(done)
        setTablesImportTotal(total)
        setTablesImportLabel(label)
      })
      setTablesImportResult(result)
      setTablesImportPhase("done")

      const totalRows = result.tables.reduce((sum, table) => sum + table.rows, 0)
      toast.success(`Restored ${totalRows} rows across ${result.tables.length} tables.`)
    } catch (err: any) {
      setTablesImportPhase("error")
      const message = err?.message ?? "Tables import failed"
      setTablesImportError(message)
      toast.error(message)
    }
  }

  function reset() {
    setTablesExportPhase("idle")
    setTablesExportDone(0)
    setTablesExportTotal(0)
    setTablesExportError(null)
    setTablesImportPhase("idle")
    setTablesImportDone(0)
    setTablesImportTotal(0)
    setTablesImportLabel("")
    setTablesImportResult(null)
    setTablesImportError(null)
    setFilesExportPhase("idle")
    setFilesExportDone(0)
    setFilesExportTotal(0)
    setFilesExportError(null)
    setFilesImportPhase("idle")
    setFilesImportDone(0)
    setFilesImportTotal(0)
    setFilesImportLabel("")
    setFilesImportResult(null)
    setFilesImportError(null)
  }

  const tablesExportProgress = tablesExportTotal > 0 ? Math.round((tablesExportDone / tablesExportTotal) * 100) : 0
  const tablesImportProgress = tablesImportTotal > 0 ? Math.round((tablesImportDone / tablesImportTotal) * 100) : 0
  const filesExportProgress = filesExportTotal > 0 ? Math.round((filesExportDone / filesExportTotal) * 100) : 0
  const filesImportProgress = filesImportTotal > 0 ? Math.round((filesImportDone / filesImportTotal) * 100) : 0

  // The label of whichever operation is currently running — used by the stall notice so it can say
  // what is still in flight.
  const activeLabel =
    tablesExportPhase === "exporting" ? "exporting tables" :
    filesExportPhase === "exporting" ? "exporting files" :
    tablesImportPhase === "importing" ? (tablesImportLabel || "importing tables") :
    filesImportPhase === "importing" ? (filesImportLabel || "importing files") :
    ""

  return {
    isBusy, isStalled, activeLabel,
    tablesExportPhase, tablesExportProgress, tablesExportDone, tablesExportTotal, tablesExportError, startExportTables,
    tablesImportPhase, tablesImportProgress, tablesImportDone, tablesImportTotal, tablesImportLabel,
    tablesImportResult, tablesImportError, startImportTables,
    filesExportPhase, filesExportProgress, filesExportDone, filesExportTotal, filesExportError,
    includeImagesFiles, setIncludeImagesFiles, startExportFiles,
    filesImportPhase, filesImportProgress, filesImportDone, filesImportTotal, filesImportLabel,
    filesImportResult, filesImportError, startImportFiles,
    reset,
  }
}
