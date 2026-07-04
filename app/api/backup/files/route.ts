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

type FileRequest = { bucket?: string; path?: string }
type PostBody = { files?: FileRequest[] }
export type UploadTarget =
  | { bucket: string; path: string; signedUrl: string }
  | { bucket: string; path: string; skipped: true; reason: string }

const MAX_FILES_PER_REQUEST = 100

// POST /api/backup/files  { files: [{ bucket, path }] }
//
// The browser has decompressed + parsed the .tar.gz locally and asks for a signed upload URL per
// storage file. A URL is issued ONLY for a path the user actually owns — a path in one of their own
// 19_songs rows (song_path or image_path). This is the security boundary: the browser's list is
// untrusted, so the server, not the client, decides which paths may be written. Unowned paths come
// back as skipped (never a URL). upsert is baked into the token so a re-import overwrites the
// existing object. The browser then PUTs each file's bytes directly to Supabase — bytes never pass
// through this function, so there is no memory/timeout ceiling on file size or count.
//
// Response: { results: UploadTarget[] }
export async function POST(req: Request) {
  const { files } = (await req.json().catch(() => ({}))) as PostBody

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "files must be a non-empty array" }, { status: 400 })
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: `at most ${MAX_FILES_PER_REQUEST} files per request` }, { status: 400 })
  }

  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { data: userSongs, error } = await supabaseAdmin.from("19_songs").select("song_path, image_path").eq("user_id", userId)
  if (error) return NextResponse.json({ error: error.message, code: error.code, details: error.details, hint: error.hint }, { status: 500 })

  const ownedSongPaths = new Set((userSongs ?? []).map((song: any) => song.song_path).filter(Boolean))
  const ownedImagePaths = new Set((userSongs ?? []).map((song: any) => song.image_path).filter(Boolean))

  const results: UploadTarget[] = []
  for (const file of files) {
    const bucket = file.bucket
    const path = file.path
    if ((bucket !== "songs" && bucket !== "images") || !path) {
      results.push({ bucket: bucket ?? "", path: path ?? "", skipped: true, reason: "invalid bucket or path" })
      continue
    }

    const isOwned = (bucket === "songs" && ownedSongPaths.has(path)) || (bucket === "images" && ownedImagePaths.has(path))
    if (!isOwned) {
      results.push({ bucket, path, skipped: true, reason: "path not found in your songs — import tables first" })
      continue
    }

    const { data, error: urlError } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path, { upsert: true })
    if (urlError || !data) {
      results.push({ bucket, path, skipped: true, reason: urlError?.message ?? "could not create upload URL" })
      continue
    }
    results.push({ bucket, path, signedUrl: data.signedUrl })
  }

  return NextResponse.json({ results })
}
