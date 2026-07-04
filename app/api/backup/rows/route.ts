import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BACKUP_TABLES, BackupTable } from "@/app/features/backup/backupTables"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Numeric columns per backup table. CSV cells arrive as strings; PostgREST coerces most types
// (timestamp/uuid/enum) from a string, but numeric columns are converted explicitly here so a
// value like "42" is sent as the number 42, never the string "42". Text columns are left as
// strings — a title that happens to be "123" must stay text (no blind auto-parsing).
const NUMERIC_COLUMNS: Record<BackupTable, string[]> = {
  "19_songs": ["id", "size_bytes"],
  "19_liked_songs": ["song_id"],
  "19_playlists": [],
  "19_playlist_songs": ["position", "song_id"],
}

// GET /api/backup/rows
//
// Returns every backed-up table's rows for the session user, as JSON — always small, never
// touches Storage bytes. The browser converts each table to CSV and packs them into one
// .tar.gz (see app/features/backup/BackupSDK.ts's exportTables).
//
// Response: { tables: Record<table, rows[]> }
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const tables: Record<string, unknown[]> = {}

  for (const table of BACKUP_TABLES) {
    if (table === "19_playlist_songs") {
      const { data: playlists } = await supabaseAdmin.from("19_playlists").select("id").eq("user_id", userId)
      const playlistIds = (playlists ?? []).map((playlist: any) => playlist.id)
      if (playlistIds.length === 0) { tables[table] = []; continue }
      const { data, error } = await supabaseAdmin.from("19_playlist_songs").select("*").in("playlist_id", playlistIds)
      if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
      tables[table] = data ?? []
    } else if (table === "19_liked_songs") {
      const { data, error } = await supabaseAdmin.from("19_liked_songs").select("*").eq("user_id", userId)
      if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
      tables[table] = data ?? []
    } else {
      const { data, error } = await (supabaseAdmin.from(table as any).select("*") as any).eq("user_id", userId)
      if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
      tables[table] = data ?? []
    }
  }

  return NextResponse.json({ tables })
}

type PostBody = { table?: string; rows?: Record<string, unknown>[] }

// Coerce numeric CSV cells (strings) to numbers; leave everything else as-is. An empty cell is
// already null from the CSV parser and stays null.
function coerceNumericColumns(table: BackupTable, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const numericColumns = NUMERIC_COLUMNS[table]
  if (numericColumns.length === 0) return rows
  return rows.map(row => {
    const coerced = { ...row }
    for (const column of numericColumns) {
      const value = coerced[column]
      if (typeof value === "string" && value !== "") coerced[column] = Number(value)
    }
    return coerced
  })
}

// POST /api/backup/rows  { table, rows }
//
// Upserts one table's rows (sent by the browser in ≤500-row batches from importTables). Rows are
// scoped to the session user — foreign user_id rows are skipped, and 19_playlist_songs rows are
// further filtered to playlists the user owns. Returns { rows, skipped } or the raw Postgres error.
export async function POST(req: Request) {
  const { table, rows } = (await req.json().catch(() => ({}))) as PostBody

  if (!table || !BACKUP_TABLES.includes(table as BackupTable)) {
    return NextResponse.json({ error: `table must be one of ${BACKUP_TABLES.join(", ")}` }, { status: 400 })
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 })
  }

  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const backupTable = table as BackupTable
  const ownedRows = coerceNumericColumns(
    backupTable,
    rows.filter(row => ("user_id" in row ? row.user_id === userId : true)),
  )

  if (backupTable === "19_playlist_songs") {
    const { data: userPlaylists } = await supabaseAdmin.from("19_playlists").select("id").eq("user_id", userId)
    const ownedPlaylistIds = new Set((userPlaylists ?? []).map((playlist: any) => playlist.id))
    const safeRows = ownedRows.filter((row: any) => ownedPlaylistIds.has(row.playlist_id))
    if (safeRows.length === 0) return NextResponse.json({ rows: 0, skipped: rows.length })
    const { error } = await supabaseAdmin.from("19_playlist_songs" as any).upsert(safeRows, { onConflict: "playlist_id,song_id" })
    if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
    return NextResponse.json({ rows: safeRows.length, skipped: rows.length - safeRows.length })
  }

  const skipped = rows.length - ownedRows.length
  if (ownedRows.length === 0) return NextResponse.json({ rows: 0, skipped })

  const { error } = await supabaseAdmin.from(backupTable as any).upsert(ownedRows)
  if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
  return NextResponse.json({ rows: ownedRows.length, skipped })
}
