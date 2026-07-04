import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BackupFileRef } from "@/app/features/backup/backupTables"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/backup/files?includeImages=true
//
// Returns the list of the user's storage file paths (song audio, and cover images if opted in) —
// paths only, never Storage bytes. The browser downloads each file directly from Supabase's public
// CDN and packs them into one .tar.gz (see app/features/backup/BackupSDK.ts's exportFiles).
//
// Response: { files: BackupFileRef[] }
export async function GET(req: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const includeImages = searchParams.get("includeImages") !== "false"

  const { data: songs, error } = await supabaseAdmin
    .from("19_songs")
    .select("song_path, image_path")
    .eq("user_id", userId)
  if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })

  const files: BackupFileRef[] = []
  for (const song of (songs ?? []) as Array<{ song_path?: string | null; image_path?: string | null }>) {
    if (song.song_path) files.push({ bucket: "songs", path: song.song_path, size: 0, contentType: "audio/mpeg" })
    if (includeImages && song.image_path) files.push({ bucket: "images", path: song.image_path, size: 0, contentType: "image/jpeg" })
  }

  return NextResponse.json({ files })
}
