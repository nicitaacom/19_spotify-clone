import { NextResponse } from "next/server"
import uniqid from "uniqid"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSafeStoragePath } from "@/libs/helpers"
import { errorText } from "@/libs/errorText"
import { createdInsideWindow, isStoredObjectPresent, lockIsStale, sameSongExistsMessage, uploadSlotPath } from "@/libs/songCreateGuard"
import { imageFileError } from "@/libs/imageFiles"
import { parseSongTags, normalizeSongTags, inferPlaylistGenreTags } from "@/libs/songTags"

import { requireUser } from "../backup/requireUser"

export const maxDuration = 60 // max on Hobby plan Vercel 60s

async function findRecentUpload(userId: string, title: string, author: string, size: number) {
  const { data, error } = await supabaseAdmin
    .from("19_songs")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("title", title)
    .eq("author", author)
    .eq("size_bytes", size)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id || !createdInsideWindow(data.created_at, Date.now())) return null
  return { id: Number(data.id) }
}

async function claimUploadSlot(slotPath: string): Promise<"claimed" | "busy"> {
  const body = new TextEncoder().encode(String(Date.now()))
  // The songs bucket allows only audio/mpeg and audio/mp4.
  const lockUpload = { upsert: false, contentType: "audio/mpeg" }
  const first = await supabaseAdmin.storage.from("songs").upload(slotPath, body, lockUpload)
  if (!first.error) return "claimed"
  if (!isStoredObjectPresent(first.error)) throw new Error(errorText(first.error))
  const downloaded = await supabaseAdmin.storage.from("songs").download(slotPath)
  const started = downloaded.data && typeof downloaded.data.text === "function"
    ? Number(await downloaded.data.text())
    : Number.NaN
  if (!lockIsStale(started, Date.now())) return "busy"
  await supabaseAdmin.storage.from("songs").remove([slotPath])
  const second = await supabaseAdmin.storage.from("songs").upload(slotPath, new TextEncoder().encode(String(Date.now())), lockUpload)
  if (!second.error) return "claimed"
  if (!isStoredObjectPresent(second.error)) throw new Error(errorText(second.error))
  return "busy"
}

async function waitForRecentUpload(userId: string, title: string, author: string, size: number) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const recent = await findRecentUpload(userId, title, author, size)
    if (recent) return recent
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

export async function POST(request: Request) {
  let slotPath = ""
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
  catch (error) { return NextResponse.json({ error: errorText(error) }, { status: 400 }) }

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
  const rejectedImage = imageFileError(imageFile)
  if (rejectedImage) {
    return NextResponse.json({ error: rejectedImage }, { status: 400 })
  }
  if (playlistId) {
    const { data: playlist, error } = await supabaseAdmin
      .from("19_playlists")
      .select("user_id,title,slug")
      .eq("id", playlistId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: errorText(error) }, { status: 500 })
    if (!playlist || playlist.user_id !== auth.userId) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
    }
    try { tags = normalizeSongTags([...tags, ...inferPlaylistGenreTags(playlist.title, playlist.slug)]) }
    catch (error) { return NextResponse.json({ error: errorText(error) }, { status: 400 }) }
  }

  const songTitle = title.trim()
  const songAuthor = author.trim()
  const recent = await findRecentUpload(auth.userId, songTitle, songAuthor, songFile.size)
  if (recent) {
    return NextResponse.json({ error: sameSongExistsMessage(songTitle) }, { status: 409 })
  }

  const slotName = uploadSlotPath(auth.userId, songTitle, songAuthor, songFile.size)
  const slot = await claimUploadSlot(slotName)
  if (slot === "busy") {
    const waited = await waitForRecentUpload(auth.userId, songTitle, songAuthor, songFile.size)
    if (!waited) {
      return NextResponse.json({ error: "This song is already uploading. Wait for it to finish." }, { status: 409 })
    }
    return NextResponse.json({ error: sameSongExistsMessage(songTitle) }, { status: 409 })
  }
  slotPath = slotName

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
    return NextResponse.json({ error: `Song storage upload failed. ${errorText(songError)}` }, { status: 400 })
  }

  const { error: imageError } = await supabaseAdmin.storage.from("images").upload(imagePath, imageFile, {
    cacheControl: "3600",
    upsert: false,
    contentType: imageFile.type.toLowerCase(),
  })
  if (imageError) {
    await supabaseAdmin.storage.from("songs").remove([songPath])
    return NextResponse.json({ error: `Image storage upload failed. ${errorText(imageError)}` }, { status: 400 })
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
    const reason = insertError ? errorText(insertError) : "Song insert returned no row."
    return NextResponse.json({ error: reason }, { status: 400 })
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
      return NextResponse.json({ error: errorText(positionError) }, { status: 400 })
    }

    const nextPosition = (existingPositions?.[0]?.position ?? -1) + 1
    const { error: linkError } = await supabaseAdmin.from("19_playlist_songs").insert({
      playlist_id: playlistId,
      song_id: songRecord.id,
      position: nextPosition,
    })
    if (linkError) {
      await discardSong()
      return NextResponse.json({ error: errorText(linkError) }, { status: 400 })
    }
    const { error: accessError } = await supabaseAdmin.from("19_song_access").upsert({
      playlist_id: playlistId,
      song_id: songRecord.id,
      is_paid: isPaid,
    }, { onConflict: "playlist_id,song_id" })
    if (accessError) {
      await discardSong()
      return NextResponse.json({ error: errorText(accessError) }, { status: 400 })
    }
  }

  return NextResponse.json({ success: true, id: songRecord.id })
  } catch (error) {
    return NextResponse.json({ error: errorText(error) }, { status: 500 })
  } finally {
    if (slotPath) await supabaseAdmin.storage.from("songs").remove([slotPath])
  }
}
