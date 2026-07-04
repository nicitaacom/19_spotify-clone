import { NextResponse } from "next/server"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
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

  if (fetchError || !song) {
    return NextResponse.json({ error: fetchError?.message ?? "Song not found" }, { status: 404 })
  }

  const { error: deleteError } = await supabaseAdmin.from("19_songs").delete().eq("id", songId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  if (song.song_path) await supabaseAdmin.storage.from("songs").remove([song.song_path])
  if (song.image_path) await supabaseAdmin.storage.from("images").remove([song.image_path])

  return NextResponse.json({ success: true })
}
