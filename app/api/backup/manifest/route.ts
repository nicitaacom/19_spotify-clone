import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"
import { BackupFileRef, estimateExportMs, SPLIT_THRESHOLD_MS } from "../backupTables"

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function getFileSize(bucket: string, path: string): Promise<number> {
  // List the parent folder and find the exact file by name
  const lastSlash = path.lastIndexOf("/")
  const folder = lastSlash >= 0 ? path.slice(0, lastSlash) : ""
  const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path

  const { data } = await supabaseAdmin.storage.from(bucket).list(folder || undefined, { search: name })
  const match = data?.find(f => f.name === name)
  return (match as any)?.metadata?.size ?? 0
}

export async function GET(req: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const includeImages = searchParams.get("includeImages") !== "false"
  const bytesPerMs = searchParams.has("bytesPerMs") ? parseFloat(searchParams.get("bytesPerMs")!) : undefined

  const { data: songs, error: songsError } = await supabaseAdmin
    .from("19_songs")
    .select("song_path, image_path")
    .eq("user_id", userId)

  if (songsError) return NextResponse.json({ error: songsError.message }, { status: 500 })

  const files: BackupFileRef[] = (
    await Promise.all(
      (songs ?? []).flatMap(song => [
        song.song_path
          ? getFileSize("songs", song.song_path)
              .catch(() => 0)
              .then(size => ({ bucket: "songs" as const, path: song.song_path!, size, contentType: "audio/mpeg" }))
          : null,
        includeImages && song.image_path
          ? getFileSize("images", song.image_path)
              .catch(() => 0)
              .then(size => ({ bucket: "images" as const, path: song.image_path!, size, contentType: "image/jpeg" }))
          : null,
      ]),
    )
  ).filter((file): file is BackupFileRef => file !== null)

  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  const estimatedMs = estimateExportMs(files, bytesPerMs)
  const shouldSplit = estimatedMs > SPLIT_THRESHOLD_MS

  // Initial split index: how many files fit in the budget at estimated throughput.
  // This is just a starting guess — the client recalibrates after each chunk
  // using the real elapsed time reported by the server.
  const BUDGET_MS = 55_000
  const splitIdx = shouldSplit
    ? Math.max(1, Math.min(Math.floor(BUDGET_MS / (estimatedMs / files.length)), files.length - 1))
    : null

  return NextResponse.json({ fileCount: files.length, totalBytes, estimatedMs, shouldSplit, splitIdx })
}
