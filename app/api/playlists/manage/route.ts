import { NextResponse } from "next/server"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { requireCommerceUser, commerceError, isId } from "@/libs/commerceHttp"
import { normalizeYoutubePlaylist, parsePlaylistPrice } from "@/libs/commerceRules"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getPlaylistSlug } from "@/libs/helpers"

export async function POST(request: Request) {
  const user = await requireCommerceUser(true)
  if (user instanceof NextResponse) return user
  try {
    const body = await request.json()
    if (body.id != null && !isId(body.id)) throw new Error("Invalid playlist.")
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200)
      throw new Error("Enter a title of up to 200 characters.")
    if (!["public", "unlisted", "private"].includes(body.visibility)) throw new Error("Invalid visibility.")
    if (body.description != null && (typeof body.description !== "string" || body.description.length > 5000))
      throw new Error("Description must be at most 5,000 characters.")
    if (typeof body.sales_enabled !== "boolean") throw new Error("Invalid sales setting.")
    if (body.sales_enabled) {
      const { data: bucket, error: bucketError } = await admin.storage.getBucket("songs")
      if (bucketError || !bucket || bucket.public)
        throw new Error("Paid playlists require private audio storage before purchases can be enabled.")
    }
    const price = parsePlaylistPrice(body.price_cents)
    const youtube = normalizeYoutubePlaylist(body.youtube_url)
    const songs = body.songs ?? []
    const removed = body.removed_songs ?? []
    if (!Array.isArray(removed) || removed.length > 2000 || removed.some(id => !/^\d+$/.test(String(id))))
      throw new Error("Invalid removed tracks.")
    if (
      !Array.isArray(songs) ||
      songs.length > 2000 ||
      songs.some(s => !s || !/^\d+$/.test(String(s.id)) || typeof s.is_paid !== "boolean")
    )
      throw new Error("Invalid track settings.")
    let ownerId = user.id
    let existingSlug: string | undefined
    if (body.id) {
      const { data, error } = await admin.from("19_playlists").select("user_id,slug").eq("id", body.id).maybeSingle()
      if (error) throw error
      if (!data || !isOwnerId(data.user_id)) return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
      ownerId = data.user_id
      existingSlug = data.slug
    }
    if (body.sales_enabled && !songs.some(song => song.is_paid)) throw new Error("Choose at least one paid song before enabling purchases.")
    if (body.sales_enabled && body.visibility === "private") throw new Error("Use public or unlisted visibility to enable purchases.")
    if (body.id) {
      const { data: orders, error: ordersError } = await admin.from("19_playlist_orders").select("id").eq("playlist_id", body.id).in("status", ["pending", "paid", "suspended"]).limit(1)
      if (ordersError) throw ordersError
      if (orders?.length && body.visibility === "private") throw new Error("Purchased playlists must remain accessible. Use unlisted visibility.")
      const { data: members, error: membersError } = await admin.from("19_playlist_songs").select("song_id").eq("playlist_id", body.id)
      if (membersError) throw membersError
      const memberIds = new Set((members ?? []).map(s => String(s.song_id)))
      if (songs.some(s => !memberIds.has(String(s.id)))) throw new Error("A song is no longer in this playlist. Refresh before saving.")
    } else if (songs.length || removed.length) throw new Error("Add songs after creating the playlist.")

    let playlistId = body.id as string | undefined
    let slug = existingSlug ?? getPlaylistSlug(body.title)
    if (!playlistId) {
      for (let attempt = 0; attempt < 10; attempt++) {
        slug = attempt ? `${getPlaylistSlug(body.title)}-${attempt + 1}` : getPlaylistSlug(body.title)
        const { data, error } = await admin.from("19_playlists").insert({ user_id: ownerId, title: body.title.trim(), slug, description: body.description?.trim() || null, visibility: body.visibility }).select("id").single()
        if (!error) { playlistId = data.id; break }
        if (error.code !== "23505" || error.message.includes("title")) throw new Error(error.message)
      }
      if (!playlistId) throw new Error("Choose another playlist name.")
    }

    const { error: configError } = await admin.from("19_playlist_commerce").upsert({ playlist_id: playlistId, price_cents: price, youtube_url: youtube, sales_enabled: false })
    if (configError) throw configError
    const { error: detailsError } = await admin.from("19_playlists").update({ title: body.title.trim(), description: body.description?.trim() || null, visibility: body.visibility, updated_at: new Date().toISOString() }).eq("id", playlistId)
    if (detailsError) throw detailsError
    if (songs.length) {
      const { error: accessError } = await admin.from("19_song_access").upsert(songs.map(song => ({ playlist_id: playlistId!, song_id: Number(song.id), is_paid: song.is_paid })), { onConflict: "playlist_id,song_id" })
      if (accessError) throw accessError
      const { error: positionError } = await admin.from("19_playlist_songs").upsert(songs.map((song, position) => ({ playlist_id: playlistId!, song_id: Number(song.id), position })), { onConflict: "playlist_id,song_id" })
      if (positionError) throw positionError
    }
    if (removed.length) {
      const { error: removeError } = await admin.from("19_playlist_songs").delete().eq("playlist_id", playlistId).in("song_id", removed.map(Number))
      if (removeError) throw removeError
    }
    const { error: salesError } = await admin.from("19_playlist_commerce").update({ sales_enabled: body.sales_enabled }).eq("playlist_id", playlistId)
    if (salesError) throw salesError
    return NextResponse.json({ id: playlistId, slug })
  } catch (error) {
    return commerceError(error)
  }
}
