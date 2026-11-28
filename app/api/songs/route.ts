import { NextResponse } from "next/server"
import uniqid from "uniqid"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSafeStoragePath } from "@/libs/helpers"
import { errorText } from "@/libs/errorText"
import {
  isStoredObjectPresent,
  isUploadId,
  lockIsStale,
  sameSongExistsMessage,
  uploadSlotPath,
} from "@/libs/songCreateGuard"
import { imageFileError } from "@/libs/imageFiles"
import { parseSongTags } from "@/libs/songTags"
import { selectDBLatestSongUpload } from "@/libs/songUploadRow"

import { requireUser } from "../backup/requireUser"

export const maxDuration = 60 // max on Hobby plan Vercel 60s
const SONG_CONTENT_TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4" }

// Same user, title, author and byte size = the same file, however long ago it was stored. A 3-minute window used to
// let a re-send after a lost answer store the song a 2nd time.
async function findSameSong(userId: string, title: string, author: string, size: number) {
  const latest = await selectDBLatestSongUpload(userId, title, author, size)
  return latest ? { id: latest.id } : null
}

function songConflict(id: number, title: string) {
  return NextResponse.json(
    { error: sameSongExistsMessage(title), code: "song_exists", song: { id, title } },
    { status: 409 },
  )
}

async function claimUploadSlot(slotPath: string): Promise<"claimed" | "busy"> {
  const body = new TextEncoder().encode(String(Date.now()))
  // The songs bucket allows only audio/mpeg and audio/mp4.
  const lockUpload = { upsert: false, contentType: "audio/mpeg" }
  const first = await supabaseAdmin.storage.from("songs").upload(slotPath, body, lockUpload)
  if (!first.error) return "claimed"
  if (!isStoredObjectPresent(first.error)) throw new Error(errorText(first.error))
  const downloaded = await supabaseAdmin.storage.from("songs").download(slotPath)
  const started =
    downloaded.data && typeof downloaded.data.text === "function" ? Number(await downloaded.data.text()) : Number.NaN
  if (!lockIsStale(started, Date.now())) return "busy"
  await supabaseAdmin.storage.from("songs").remove([slotPath])
  const second = await supabaseAdmin.storage
    .from("songs")
    .upload(slotPath, new TextEncoder().encode(String(Date.now())), lockUpload)
  if (!second.error) return "claimed"
  if (!isStoredObjectPresent(second.error)) throw new Error(errorText(second.error))
  return "busy"
}

async function waitForSameSong(userId: string, title: string, author: string, size: number) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const sameSong = await findSameSong(userId, title, author, size)
    if (sameSong) return sameSong
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
    const replaceValue = formData.get("replaceSongId")
    const replaceSongId = replaceValue === null ? null : Number(replaceValue)
    const uploadId = formData.get("uploadId")
    if (
      (replaceValue !== null &&
        (typeof replaceValue !== "string" || !Number.isSafeInteger(replaceSongId) || Number(replaceSongId) <= 0)) ||
      (uploadId !== null && !isUploadId(uploadId))
    ) {
      return NextResponse.json({ error: "Invalid upload or replacement ID. Choose the song again." }, { status: 400 })
    }
    let tags: string[]
    try {
      tags = parseSongTags(formData.get("tags"))
    } catch (error) {
      return NextResponse.json({ error: errorText(error) }, { status: 400 })
    }

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
    const expectedContentType = extension ? SONG_CONTENT_TYPES[extension] : undefined
    const contentType = songFile.type.toLowerCase()
    if (!expectedContentType || contentType !== expectedContentType) {
      return NextResponse.json({ error: "Choose an MP3 or M4A file." }, { status: 400 })
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
        .select("user_id")
        .eq("id", playlistId)
        .maybeSingle()
      if (error) return NextResponse.json({ error: errorText(error) }, { status: 500 })
      if (!playlist || playlist.user_id !== auth.userId) {
        return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
      }
    }

    const songTitle = title.trim()
    const songAuthor = author.trim()
    const { data: replacement, error: replacementError } =
      replaceSongId === null
        ? { data: null, error: null }
        : await supabaseAdmin
            .from("19_songs")
            .select("id, song_path, image_path")
            .eq("id", replaceSongId)
            .eq("user_id", auth.userId)
            .maybeSingle()
    if (replacementError) throw replacementError
    if (replaceSongId !== null && !replacement) {
      return NextResponse.json(
        { error: "The song to replace was removed or belongs to another account. Upload with a new name instead." },
        { status: 404 },
      )
    }
    const sameSong = await findSameSong(auth.userId, songTitle, songAuthor, songFile.size)
    if (sameSong && sameSong.id !== replaceSongId) {
      return songConflict(sameSong.id, songTitle)
    }

    const slotName = replacement
      ? `upload-lock/replace-${replacement.id}`
      : uploadSlotPath(auth.userId, songTitle, songAuthor, songFile.size)
    const slot = await claimUploadSlot(slotName)
    if (slot === "busy") {
      if (replacement) {
        return NextResponse.json(
          { error: "This song is already being replaced. Wait for that upload to finish, then try again." },
          { status: 409 },
        )
      }
      const waited = await waitForSameSong(auth.userId, songTitle, songAuthor, songFile.size)
      if (!waited) {
        return NextResponse.json({ error: "This song is already uploading. Wait for it to finish." }, { status: 409 })
      }
      return songConflict(waited.id, songTitle)
    }
    slotPath = slotName

    const uniqueID = isUploadId(uploadId) ? uploadId : uniqid()
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
      contentType,
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

    // checked again after the files are stored: a 2nd request for this file that started before the 1st one inserted
    // its row (the browser re-sent the POST, or the lock went stale during a long upload) stops here
    const repeatedSong = await findSameSong(auth.userId, songTitle, songAuthor, songFile.size)
    if (repeatedSong && repeatedSong.id !== replaceSongId) {
      await Promise.all([
        supabaseAdmin.storage.from("songs").remove([songPath]),
        supabaseAdmin.storage.from("images").remove([imagePath]),
      ])
      return songConflict(repeatedSong.id, songTitle)
    }

    if (replacement) {
      // Store the new files first and update the same row last. A failed replacement keeps the old audio playable.
      let addedPlaylistLink = false
      let accessChanged = false
      let previousAccess: { is_paid: boolean } | null = null
      try {
        const [{ data: membership, error: membershipError }, access] = await Promise.all([
          supabaseAdmin
            .from("19_playlist_songs")
            .select("song_id")
            .eq("playlist_id", playlistId)
            .eq("song_id", replacement.id)
            .maybeSingle(),
          supabaseAdmin
            .from("19_song_access")
            .select("is_paid")
            .eq("playlist_id", playlistId)
            .eq("song_id", replacement.id)
            .maybeSingle(),
        ])
        if (membershipError || access.error) throw membershipError ?? access.error
        previousAccess = access.data
        if (!membership) {
          const { data: positions, error: positionError } = await supabaseAdmin
            .from("19_playlist_songs")
            .select("position")
            .eq("playlist_id", playlistId)
            .order("position", { ascending: false })
            .limit(1)
          if (positionError) throw positionError
          const { error: linkError } = await supabaseAdmin.from("19_playlist_songs").insert({
            playlist_id: playlistId,
            song_id: replacement.id,
            position: (positions?.[0]?.position ?? -1) + 1,
          })
          if (linkError) throw linkError
          addedPlaylistLink = true
        }
        const { error: accessError } = await supabaseAdmin.from("19_song_access").upsert(
          {
            playlist_id: playlistId,
            song_id: replacement.id,
            is_paid: isPaid,
          },
          { onConflict: "playlist_id,song_id" },
        )
        if (accessError) throw accessError
        accessChanged = true
        const update = supabaseAdmin
          .from("19_songs")
          .update({
            title: songTitle,
            author: songAuthor,
            song_path: songPath,
            image_path: imagePath,
            size_bytes: songFile.size,
            tags,
          })
          .eq("id", replacement.id)
          .eq("user_id", auth.userId)
        const { data: updated, error: updateError } = await (
          replacement.song_path === null ? update.is("song_path", null) : update.eq("song_path", replacement.song_path)
        )
          .select("id")
          .maybeSingle()
        if (updateError) throw updateError
        if (!updated)
          throw new Error("The existing song changed during this upload. Review it, then choose Replace again.")
      } catch (error) {
        if (accessChanged) {
          if (previousAccess) {
            await supabaseAdmin.from("19_song_access").upsert(
              {
                playlist_id: playlistId,
                song_id: replacement.id,
                is_paid: previousAccess.is_paid,
              },
              { onConflict: "playlist_id,song_id" },
            )
          } else {
            await supabaseAdmin
              .from("19_song_access")
              .delete()
              .eq("playlist_id", playlistId)
              .eq("song_id", replacement.id)
          }
        }
        if (addedPlaylistLink)
          await supabaseAdmin
            .from("19_playlist_songs")
            .delete()
            .eq("playlist_id", playlistId)
            .eq("song_id", replacement.id)
        await Promise.all([
          supabaseAdmin.storage.from("songs").remove([songPath]),
          supabaseAdmin.storage.from("images").remove([imagePath]),
        ])
        throw error
      }
      // Cleanup cannot turn a completed replacement into a reported upload failure.
      await Promise.allSettled([
        ...(replacement.song_path ? [supabaseAdmin.storage.from("songs").remove([replacement.song_path])] : []),
        ...(replacement.image_path ? [supabaseAdmin.storage.from("images").remove([replacement.image_path])] : []),
      ])
      return NextResponse.json({ success: true, id: replacement.id, replaced: true })
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
      // Older databases can still have a playlist-membership trigger that adds genre tags.
      // Restore the submitted tags after linking until that trigger is removed by the migration.
      const { data: retagged, error: tagError } = await supabaseAdmin
        .from("19_songs")
        .update({ tags })
        .eq("id", songRecord.id)
        .eq("user_id", auth.userId)
        .select("id")
        .maybeSingle()
      if (tagError || !retagged) {
        await discardSong()
        return NextResponse.json(
          { error: tagError ? errorText(tagError) : "Could not save the selected song tags." },
          { status: 400 },
        )
      }
      const { error: accessError } = await supabaseAdmin.from("19_song_access").upsert(
        {
          playlist_id: playlistId,
          song_id: songRecord.id,
          is_paid: isPaid,
        },
        { onConflict: "playlist_id,song_id" },
      )
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
