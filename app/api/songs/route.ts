import { NextResponse } from "next/server"
import uniqid from "uniqid"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSafeStoragePath } from "@/libs/helpers"
import { parseSongTags, normalizeSongTags, inferPlaylistGenreTags } from "@/libs/songTags"

import { requireUser } from "../backup/requireUser"

export const maxDuration = 60 // max on Hobby plan Vercel 60s

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
}

export async function POST(request: Request) {
  try {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  if (!isOwnerId(auth.userId)) {
    return NextResponse.json({ error: "Only the site admin can upload songs." }, { status: 403 })
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
  let tags: string[]
  try { tags = parseSongTags(formData.get("tags")) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid tags." }, { status: 400 }) }

  if (!(songFile instanceof File) || !(imageFile instanceof File) || !title?.trim() || !author?.trim()) {
    const missing = [
      !(songFile instanceof File) ? "song file" : "",
      !(imageFile instanceof File) ? "image" : "",
      !title?.trim() ? "title" : "",
      !author?.trim() ? "author" : "",
    ].filter(Boolean)
    return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400 })
  }
  const extension = songFile.name.split(".").pop()?.toLowerCase()
  if (extension !== "mp3" || songFile.type.toLowerCase() !== "audio/mpeg") {
    return NextResponse.json({ error: "Choose an MP3 file." }, { status: 400 })
  }
  if (songFile.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio exceeds the 50 MB upload limit." }, { status: 400 })
  }
  if (!playlistId) {
    return NextResponse.json({ error: "Select a playlist before uploading." }, { status: 400 })
  }
  const imageExtension = imageFile.name.split(".").pop()?.toLowerCase() ?? ""
  if (
    IMAGE_MIME_BY_EXTENSION[imageExtension] !== imageFile.type.toLowerCase() ||
    imageFile.size > 10 * 1024 * 1024
  ) {
    return NextResponse.json(
      { error: "Choose a JPG, JPEG, PNG, WebP, or AVIF image smaller than 10 MB." },
      { status: 400 },
    )
  }
  if (playlistId) {
    const { data: playlist, error } = await supabaseAdmin
      .from("19_playlists")
      .select("user_id,title,slug")
      .eq("id", playlistId)
      .maybeSingle()
    if (error || !playlist || playlist.user_id !== auth.userId) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
    }
    try { tags = normalizeSongTags([...tags, ...inferPlaylistGenreTags(playlist.title, playlist.slug)]) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Too many song tags." }, { status: 400 }) }
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
    contentType: "audio/mpeg",
  })
  if (songError) {
    return NextResponse.json({ error: `Failed song upload: ${songError.message}` }, { status: 400 })
  }

  const { error: imageError } = await supabaseAdmin.storage.from("images").upload(imagePath, imageFile, {
    cacheControl: "3600",
    upsert: false,
    contentType: imageFile.type.toLowerCase(),
  })
  if (imageError) {
    await supabaseAdmin.storage.from("songs").remove([songPath])
    return NextResponse.json({ error: `Failed image upload: ${imageError.message}` }, { status: 400 })
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
      tags,
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
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error"
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `${name}: ${message}` }, { status: 500 })
  }
}
