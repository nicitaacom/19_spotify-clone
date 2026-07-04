import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BACKUP_TABLES } from "../backupTables"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/backup/rows
//
// Returns every backed-up table's rows for the session user, as JSON — always small, never
// touches Storage bytes. The browser converts each table to CSV and packs them into one
// .tar.gz (see app/sdk/BackupSDK.ts's exportTables).
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
