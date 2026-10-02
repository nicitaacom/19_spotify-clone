import { NextResponse } from "next/server"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { requireCommerceUser, commerceError, isId } from "@/libs/commerceHttp"
import { isOwnerId } from "@/libs/getOwnerIds"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  try {
    const { id } = await params
    if (!isId(id)) throw new Error("Invalid playlist.")
    const { songIds } = await request.json()
    if (!Array.isArray(songIds) || songIds.length > 2000 || songIds.some(songId => !/^\d+$/.test(String(songId)))) {
      throw new Error("Invalid song order.")
    }
    const ids = songIds.map(String)
    if (new Set(ids).size !== ids.length) throw new Error("Song order contains duplicates.")

    const { data: playlist, error: playlistError } = await admin
      .from("19_playlists")
      .select("user_id")
      .eq("id", id)
      .maybeSingle()
    if (playlistError) throw playlistError
    if (!playlist || (playlist.user_id !== user.id && !(isOwnerId(user.id) && isOwnerId(playlist.user_id)))) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
    }
    const { data: members, error: membersError } = await admin
      .from("19_playlist_songs")
      .select("song_id")
      .eq("playlist_id", id)
    if (membersError) throw membersError
    const memberIds = new Set((members ?? []).map(item => String(item.song_id)))
    if (ids.length !== memberIds.size || ids.some(songId => !memberIds.has(songId))) {
      return NextResponse.json({ error: "Playlist tracks changed. Refresh before reordering." }, { status: 409 })
    }
    if (ids.length) {
      const { error } = await admin.from("19_playlist_songs").upsert(
        ids.map((songId, position) => ({ playlist_id: id, song_id: Number(songId), position })),
        { onConflict: "playlist_id,song_id" },
      )
      if (error) throw error
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return commerceError(error)
  }
}
