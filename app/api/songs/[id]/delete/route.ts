import { NextResponse } from "next/server"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { errorText } from "@/libs/errorText"
import { isOwnerId } from "@/libs/getOwnerIds"

import { requireUser } from "../../../backup/requireUser"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  if (!isOwnerId(auth.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const songId = Number(id)

  const { data: song, error: fetchError } = await supabaseAdmin
    .from("19_songs")
    .select("song_path, image_path")
    .eq("id", songId)
    .single()

  if (fetchError) return NextResponse.json({ error: errorText(fetchError) }, { status: 500 })
  if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 })

  const files = [
    ...(song.song_path ? [{ bucket: "songs", path: song.song_path }] : []),
    ...(song.image_path ? [{ bucket: "images", path: song.image_path }] : []),
  ]
  for (const file of files) {
    const { error } = await supabaseAdmin.storage.from(file.bucket).remove([file.path])
    if (error) {
      return NextResponse.json({ error: `Could not delete the ${file.bucket === "songs" ? "audio" : "cover"} file. Other files may already have been removed. Retry deleting the song. ${errorText(error)}` }, { status: 502 })
    }
  }

  const { error: deleteError } = await supabaseAdmin.from("19_songs").delete().eq("id", songId)
  if (deleteError) {
    return NextResponse.json({ error: `Files were removed, but the song record could not be deleted. Retry deleting it. ${errorText(deleteError)}` }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
