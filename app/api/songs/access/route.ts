import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { isOwnerId } from "@/libs/getOwnerIds"
import { applyPlaylistSongAccess, getSongAccess } from "@/libs/playlistAccess"
import { commerceError } from "@/libs/commerceHttp"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"

export async function POST(request: Request) {
  try {
    const { ids, playlist_id: playlistId } = await request.json()
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => typeof id !== "string" || !/^\d+$/.test(id)))
      throw new Error("Invalid song IDs.")
    if (playlistId !== undefined && (typeof playlistId !== "string" || !/^[0-9a-f-]{36}$/i.test(playlistId)))
      throw new Error("Invalid playlist ID.")
    if (!ids.length) return NextResponse.json({ access: {} }, { headers: { "Cache-Control": "private, no-store" } })
    const client = await createRouteHandlerClient()
    const {
      data: { user },
    } = await client.auth.getUser()
    const viewer = { id: user?.id ?? null, isOwner: isOwnerId(user?.id) }
    let access: Map<string, { is_paid?: boolean; can_play?: boolean; unlock_slug?: string | null }>
    if (playlistId) {
      const [{ data: playlist, error: playlistError }, { data: memberships, error: membershipError }] = await Promise.all([
        admin.from("19_playlists").select("user_id,visibility").eq("id", playlistId).maybeSingle(),
        admin.from("19_playlist_songs").select("song_id").eq("playlist_id", playlistId).in("song_id", ids.map(Number)),
      ])
      if (playlistError || membershipError) throw playlistError ?? membershipError
      if (!playlist) return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
      const canManage = playlist.user_id === viewer.id || (viewer.isOwner && isOwnerId(playlist.user_id))
      if (playlist.visibility === "private" && !canManage)
        return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
      const memberIds = new Set((memberships ?? []).map(item => String(item.song_id)))
      const localAccess = await applyPlaylistSongAccess(
        playlistId,
        ids.filter(id => memberIds.has(id)).map(id => ({
          id,
          user_id: "",
          author: "",
          title: "",
          song_path: "",
          image_path: "",
        })),
        viewer,
        canManage,
      )
      const localById = new Map(localAccess.map(song => [song.id, {
        is_paid: song.is_paid,
        can_play: song.can_play,
        unlock_slug: song.unlock_slug,
      }]))
      access = new Map(ids.map(id => [id, localById.get(id) ?? { is_paid: false, can_play: false, unlock_slug: null }]))
    } else {
      access = await getSongAccess(ids, viewer)
    }
    return NextResponse.json(
      { access: Object.fromEntries(access) },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return commerceError(error, 503)
  }
}
