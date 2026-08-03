import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BACKUP_TABLES, getTableConfig, assertBackupAccess } from "@/app/features/backup/backupTables"
import { Database } from "@/app/interfaces/types_db"

type TableName = keyof Database["public"]["Tables"]

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/backup/rows
//
// Returns every backed-up table's rows visible to the session user, as JSON — always small, never
// touches Storage bytes. The browser converts each table to CSV and packs them into one .tar.gz
// (see app/features/backup/BackupSDK.ts's exportTables). Each table's scopeSelect (backupConfig.ts)
// decides what "visible to this user" means — user_id equality for most tables, an
// owned-playlists join for 19_playlist_songs.
//
// Response: { tables: Record<table, rows[]> }
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  if (!(await assertBackupAccess(userId, supabaseAdmin))) {
    return NextResponse.json({ error: "Not allowed to back up this account" }, { status: 403 })
  }

  const tables: Record<string, unknown[]> = {}

  for (const table of BACKUP_TABLES) {
    if (table.scopeSelect) {
      const { data, error } = await table.scopeSelect(supabaseAdmin, userId)
      if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
      tables[table.name] = data ?? []
    } else {
      const { data, error } = await supabaseAdmin.from(table.name as TableName).select("*")
      if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
      tables[table.name] = data ?? []
    }
  }

  return NextResponse.json({ tables })
}

type PostBody = { table?: string; rows?: Record<string, unknown>[] }

// POST /api/backup/rows  { table, rows }
//
// Upserts one table's rows (sent by the browser in ≤500-row batches from importTables). Column
// coercion (numeric/array/jsonb) already happened client-side during CSV parse. Each table's
// scopeRows (backupConfig.ts) filters to rows the caller may write — foreign user_id rows are
// skipped, and 19_playlist_songs rows are further filtered to playlists the user owns.
// Returns { rows, skipped } or the raw Postgres error.
export async function POST(req: Request) {
  const { table, rows } = (await req.json().catch(() => ({}))) as PostBody

  const config = table ? getTableConfig(table) : undefined
  if (!config) {
    return NextResponse.json({ error: `table must be one of ${BACKUP_TABLES.map(t => t.name).join(", ")}` }, { status: 400 })
  }
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 })
  }

  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  if (!(await assertBackupAccess(userId, supabaseAdmin))) {
    return NextResponse.json({ error: "Not allowed to back up this account" }, { status: 403 })
  }

  const ownedRows = config.scopeRows ? await config.scopeRows(supabaseAdmin, userId, rows) : rows
  const skipped = rows.length - ownedRows.length
  if (ownedRows.length === 0) return NextResponse.json({ rows: 0, skipped })

  // ownedRows' shape varies per dynamic table (backupConfig.ts), so no single table's upsert row type fits it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabaseAdmin.from(config.name as TableName).upsert(ownedRows as any, { onConflict: config.onConflict })
  if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })
  return NextResponse.json({ rows: ownedRows.length, skipped })
}
