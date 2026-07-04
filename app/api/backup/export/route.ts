import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BACKUP_TABLES, BackupFileRef } from "@/app/features/backup/backupTables"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/backup/export?includeImages=true
//
// Returns backup METADATA ONLY — table rows + a list of storage file paths. This route never
// touches Storage bytes, so it always returns well under the platform timeout regardless of how
// large the user's library is. The browser downloads each file directly from Supabase's public
// CDN and assembles the .tar.gz locally (see app/features/backup/BackupSDK.ts), keeping the Vercel function
// out of the byte path entirely.
//
// Response: { tables: Record<table, rows[]>, files: BackupFileRef[] }
export async function GET(req: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const includeImages = searchParams.get("includeImages") !== "false"

  // ── Fetch table data ───────────────────────────────────────────────────────
  const tables: Record<string, unknown[]> = {}

  for (const table of BACKUP_TABLES) {
    if (table === "19_playlist_songs") {
      const { data: playlists } = await supabaseAdmin.from("19_playlists").select("id").eq("user_id", userId)
      const playlistIds = (playlists ?? []).map((p: any) => p.id)
      if (playlistIds.length === 0) { tables[table] = []; continue }
      const { data, error } = await supabaseAdmin.from("19_playlist_songs").select("*").in("playlist_id", playlistIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      tables[table] = data ?? []
    } else if (table === "19_liked_songs") {
      const { data, error } = await supabaseAdmin.from("19_liked_songs").select("*").eq("user_id", userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      tables[table] = data ?? []
    } else {
      const { data, error } = await (supabaseAdmin.from(table as any).select("*") as any).eq("user_id", userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      tables[table] = data ?? []
    }
  }

  // ── Collect storage file refs (paths only — sizes are irrelevant now) ──────
  const songs = (tables["19_songs"] ?? []) as Array<{ song_path?: string | null; image_path?: string | null }>
  const files: BackupFileRef[] = []
  for (const song of songs) {
    if (song.song_path) files.push({ bucket: "songs", path: song.song_path, size: 0, contentType: "audio/mpeg" })
    if (includeImages && song.image_path) files.push({ bucket: "images", path: song.image_path, size: 0, contentType: "image/jpeg" })
  }

  return NextResponse.json({ tables, files })
}
