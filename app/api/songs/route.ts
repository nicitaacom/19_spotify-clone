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

  if (!auth.email) {
    return NextResponse.json({ error: "Missing account email" }, { status: 400 })
  }

  const formData = await request.formData()
  const songFile = formData.get("song") as File | null
  const imageFile = formData.get("image") as File | null
  const title = formData.get("title") as string | null
  const author = formData.get("author") as string | null
  const playlistId = formData.get("playlistId") as string | null
  const isPaid = formData.get("isPaid") === "true"

  if (!(songFile instanceof File) || !(imageFile instanceof File) || !title?.trim() || !author?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }
  const extension = songFile.name.split(".").pop()?.toLowerCase()
  if (extension !== "mp3" && extension !== "m4a") {
    return NextResponse.json({ error: "Choose an MP3 or M4A file." }, { status: 400 })
  }
  if (songFile.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio exceeds the 50 MB upload limit." }, { status: 400 })
  }
  if (isPaid && !playlistId) {
    return NextResponse.json({ error: "Select a playlist for a paid song." }, { status: 400 })
  }
  if (!imageFile.type.startsWith("image/") || imageFile.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Choose an image smaller than 10 MB." }, { status: 400 })
  }
  if (playlistId) {
    const { data: playlist, error } = await supabaseAdmin
      .from("19_playlists")
      .select("user_id")
      .eq("id", playlistId)
      .maybeSingle()
    if (error || !playlist || playlist.user_id !== auth.userId) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
    }
  }

  const uniqueID = uniqid()
  const songPath = getSafeStoragePath({
    prefix: "song",
    value: title,
    uniqueId: uniqueID,
    fileName: songFile.name,
    ownerEmail: auth.email,
  })
  const imagePath = getSafeStoragePath({
    prefix: "image",
    value: title,
    uniqueId: uniqueID,
    fileName: imageFile.name,
    ownerEmail: auth.email,
  })

  const { error: songError } = await supabaseAdmin.storage.from("songs").upload(songPath, songFile, {
    cacheControl: "3600",
    upsert: false,
    contentType: extension === "m4a" ? "audio/mp4" : "audio/mpeg",
  })
  if (songError) {
    return NextResponse.json({ error: `Failed song upload: ${songError.message}` }, { status: 400 })
  }

  const { error: imageError } = await supabaseAdmin.storage.from("images").upload(imagePath, imageFile, {
    cacheControl: "3600",
    upsert: false,
  })
  if (imageError) {
    await supabaseAdmin.storage.from("songs").remove([songPath])
    return NextResponse.json({ error: "Failed image upload" }, { status: 400 })
  }

  const { data: songRecord, error: insertError } = await supabaseAdmin
    .from("19_songs")
    .insert({
      user_id: auth.userId,
      title: title.trim(),
      author: author.trim(),
      image_path: imagePath,
      song_path: songPath,
      size_bytes: songFile.size,
    })
    .select("id")
    .single()

  if (insertError || !songRecord) {
    await Promise.all([
      supabaseAdmin.storage.from("songs").remove([songPath]),
      supabaseAdmin.storage.from("images").remove([imagePath]),
    ])
    return NextResponse.json({ error: insertError?.message ?? "Failed to create song" }, { status: 400 })
  }

  const discardSong = async () => {
    await supabaseAdmin.from("19_song_access").delete().eq("song_id", songRecord.id)
    await supabaseAdmin.from("19_playlist_songs").delete().eq("song_id", songRecord.id)
    await supabaseAdmin.from("19_songs").delete().eq("id", songRecord.id)
    await Promise.all([
      supabaseAdmin.storage.from("songs").remove([songPath]),
      supabaseAdmin.storage.from("images").remove([imagePath]),
    ])
  }

  if (playlistId) {
    const { data: existingPositions, error: positionError } = await supabaseAdmin
      .from("19_playlist_songs")
      .select("position")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: false })
      .limit(1)

    if (positionError) {
      await discardSong()
      return NextResponse.json({ error: positionError.message }, { status: 400 })
    }

    const nextPosition = (existingPositions?.[0]?.position ?? -1) + 1
    const { error: membershipError } = await supabaseAdmin.from("19_playlist_songs").insert({
      playlist_id: playlistId,
      song_id: songRecord.id,
      position: nextPosition,
    })
    if (membershipError) {
      await discardSong()
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }
    const { error: accessError } = await supabaseAdmin.from("19_song_access").upsert({
      playlist_id: playlistId,
      song_id: songRecord.id,
      is_paid: isPaid,
    }, { onConflict: "playlist_id,song_id" })
    if (accessError) {
      await discardSong()
      return NextResponse.json({ error: accessError.message }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true, id: songRecord.id })
}
