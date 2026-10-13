import { NextResponse } from "next/server"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { requireCommerceUser, commerceError } from "@/libs/commerceHttp"
import { getSafeStoragePath } from "@/libs/helpers"
import { isOwnerId } from "@/libs/getOwnerIds"
import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { getSongAccess } from "@/libs/playlistAccess"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    const client = await createRouteHandlerClient()
    const {
      data: { user },
    } = await client.auth.getUser()
    const access = (await getSongAccess([id], { id: user?.id ?? null, isOwner: isOwnerId(user?.id) })).get(id)
    if (!access?.can_play) {
      return NextResponse.json(
        { error: "Purchase a playlist containing this song to view it." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      )
    }

    const { data: song, error } = await admin
      .from("19_songs")
      .select("id, user_id, title, author, image_path")
      .eq("id", Number(id))
      .maybeSingle()
    if (error) throw error
    if (!song) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    return NextResponse.json(
      { song: { ...song, id: String(song.id), song_path: "", ...access } },
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    return commerceError(error, 503)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) throw new Error("Invalid song.")
    const isForm = request.headers.get("content-type")?.includes("multipart/form-data")
    const input = isForm ? await request.formData() : await request.json()
    const title = isForm ? input.get("title") : input.title
    const author = isForm ? input.get("author") : input.author
    const image = isForm ? input.get("image") : null
    const playlistId = isForm ? input.get("playlistId") : input.playlistId
    const paidValue = isForm ? input.get("isPaid") : input.isPaid
    if (typeof title !== "string" || !title.trim() || typeof author !== "string" || !author.trim()) {
      throw new Error("Title and artist are required.")
    }
    if (image && (!(image instanceof File) || !image.type.startsWith("image/") || image.size > 10 * 1024 * 1024)) {
      throw new Error("Choose an image smaller than 10 MB.")
    }
    if (playlistId && (typeof playlistId !== "string" || !/^[0-9a-f-]{36}$/i.test(playlistId) || !["true", "false", true, false].includes(paidValue))) {
      throw new Error("Invalid playlist access setting.")
    }
    const { data: song, error: songError } = await admin
      .from("19_songs")
      .select("image_path,user_id")
      .eq("id", Number(id))
      .maybeSingle()
    if (songError) throw songError
    if (!song) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    if (song.user_id !== user.id && !isOwnerId(user.id)) {
      return NextResponse.json({ error: "You cannot edit this song." }, { status: 403 })
    }

    let previousAccess: boolean | null = null
    if (playlistId) {
      const [{ data: playlist, error: playlistError }, { data: membership, error: membershipError }, access] = await Promise.all([
        admin.from("19_playlists").select("user_id").eq("id", playlistId).maybeSingle(),
        admin.from("19_playlist_songs").select("song_id").eq("playlist_id", playlistId).eq("song_id", Number(id)).maybeSingle(),
        admin.from("19_song_access").select("is_paid").eq("playlist_id", playlistId).eq("song_id", Number(id)).maybeSingle(),
      ])
      if (playlistError || membershipError || access.error) throw playlistError ?? membershipError ?? access.error
      if (!playlist || !membership || (playlist.user_id !== user.id && !(isOwnerId(user.id) && isOwnerId(playlist.user_id)))) {
        return NextResponse.json({ error: "Song is not in a manageable playlist." }, { status: 403 })
      }
      previousAccess = access.data?.is_paid ?? null
    }

    let imagePath: string | null = null
    if (image instanceof File) {
      if (!user.email) throw new Error("Missing account email.")
      imagePath = getSafeStoragePath({
        prefix: "image", value: title, uniqueId: crypto.randomUUID(), fileName: image.name, ownerEmail: user.email,
      })
      const { error } = await admin.storage.from("images").upload(imagePath, image, { upsert: false, contentType: image.type })
      if (error) throw error
    }

    if (playlistId) {
      const { error } = await admin.from("19_song_access").upsert({
        playlist_id: playlistId, song_id: Number(id), is_paid: paidValue === true || paidValue === "true",
      }, { onConflict: "playlist_id,song_id" })
      if (error) {
        if (imagePath) await admin.storage.from("images").remove([imagePath])
        throw error
      }
    }

    const { error: updateError } = await admin
      .from("19_songs")
      .update({ title: title.trim(), author: author.trim(), ...(imagePath ? { image_path: imagePath } : {}) })
      .eq("id", Number(id))
    if (updateError) {
      if (playlistId) {
        if (previousAccess === null) {
          await admin.from("19_song_access").delete().eq("playlist_id", playlistId).eq("song_id", Number(id))
        } else {
          await admin.from("19_song_access").update({ is_paid: previousAccess }).eq("playlist_id", playlistId).eq("song_id", Number(id))
        }
      }
      if (imagePath) await admin.storage.from("images").remove([imagePath])
      throw updateError
    }
    if (imagePath && song.image_path) await admin.storage.from("images").remove([song.image_path])
    return NextResponse.json({ success: true, image_path: imagePath ?? song.image_path })
  } catch (error) {
    return commerceError(error)
  }
}
