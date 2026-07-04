import { NextResponse } from "next/server"
import uniqid from "uniqid"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSafeStoragePath } from "@/libs/helpers"

import { requireUser } from "../backup/requireUser"

export const maxDuration = 60 // max on Hobby plan Vercel 60s

export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  if (!isOwnerId(auth.userId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await request.formData()
  const songFile = formData.get("song") as File | null
  const imageFile = formData.get("image") as File | null
  const title = formData.get("title") as string | null
  const author = formData.get("author") as string | null
  const playlistId = formData.get("playlistId") as string | null
  const playlistSlug = formData.get("playlistSlug") as string | null

  if (!songFile || !imageFile || !title || !author) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const uniqueID = uniqid()
  const songPath = getSafeStoragePath({
    prefix: "song",
    value: title,
    uniqueId: uniqueID,
    fileName: songFile.name,
    folder: playlistSlug ?? undefined,
  })
  const imagePath = getSafeStoragePath({
    prefix: "image",
    value: title,
    uniqueId: uniqueID,
    fileName: imageFile.name,
    folder: playlistSlug ?? undefined,
  })

  const { error: songError } = await supabaseAdmin.storage.from("songs").upload(songPath, songFile, {
    cacheControl: "3600",
    upsert: false,
    contentType: songFile.type || "audio/mpeg",
  })
  if (songError) {
    return NextResponse.json({ error: `Failed song upload: ${songError.message}` }, { status: 400 })
  }

  const { error: imageError } = await supabaseAdmin.storage.from("images").upload(imagePath, imageFile, {
    cacheControl: "3600",
    upsert: false,
  })
  if (imageError) {
    return NextResponse.json({ error: "Failed image upload" }, { status: 400 })
  }

  const { data: songRecord, error: insertError } = await supabaseAdmin
    .from("19_songs")
    .insert({
      user_id: auth.userId,
      title,
      author,
      image_path: imagePath,
      song_path: songPath,
      size_bytes: songFile.size,
    })
    .select("id")
    .single()

  if (insertError || !songRecord) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create song" }, { status: 400 })
  }

  if (playlistId) {
    const { data: existingPositions } = await supabaseAdmin
      .from("19_playlist_songs")
      .select("position")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: false })
      .limit(1)

    const nextPosition = (existingPositions?.[0]?.position ?? -1) + 1
    await supabaseAdmin.from("19_playlist_songs").insert({
      playlist_id: playlistId,
      song_id: songRecord.id,
      position: nextPosition,
    })
  }

  return NextResponse.json({ success: true, id: songRecord.id })
}
