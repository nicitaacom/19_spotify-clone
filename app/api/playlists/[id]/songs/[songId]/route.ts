import { NextResponse } from "next/server"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { commerceError, isId, requireCommerceUser } from "@/libs/commerceHttp"
import { isOwnerId } from "@/libs/getOwnerIds"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; songId: string }> }) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  try {
    const { id, songId } = await params
    if (!isId(id) || !/^\d+$/.test(songId)) throw new Error("Invalid playlist track.")

    const { data: playlist, error: playlistError } = await admin
      .from("19_playlists")
      .select("user_id")
      .eq("id", id)
      .maybeSingle()
    if (playlistError) throw playlistError
    if (!playlist || (playlist.user_id !== user.id && !(isOwnerId(user.id) && isOwnerId(playlist.user_id)))) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
    }

    const [{ data: members, error: membersError }, { data: access, error: accessError }, { data: commerce, error: commerceErrorValue }] = await Promise.all([
      admin.from("19_playlist_songs").select("song_id").eq("playlist_id", id),
      admin.from("19_song_access").select("song_id,is_paid").eq("playlist_id", id),
      admin.from("19_playlist_commerce").select("sales_enabled").eq("playlist_id", id).maybeSingle(),
    ])
    if (membersError || accessError || commerceErrorValue) throw membersError ?? accessError ?? commerceErrorValue
    const memberIds = new Set((members ?? []).map(item => String(item.song_id)))
    if (!memberIds.has(songId)) return NextResponse.json({ error: "Track not found in this playlist." }, { status: 404 })
    const paidMembers = (access ?? []).filter(item => item.is_paid && memberIds.has(String(item.song_id)))
    if (commerce?.sales_enabled && paidMembers.length === 1 && String(paidMembers[0].song_id) === songId) {
      return NextResponse.json({ error: "Mark another track paid or disable purchases before removing the last paid track." }, { status: 409 })
    }

    const { error: removeError } = await admin.from("19_playlist_songs")
      .delete().eq("playlist_id", id).eq("song_id", Number(songId))
    if (removeError) throw removeError
    const { error: removeAccessError } = await admin.from("19_song_access")
      .delete().eq("playlist_id", id).eq("song_id", Number(songId))
    if (removeAccessError) throw removeAccessError
    const { error: updateError } = await admin.from("19_playlists")
      .update({ updated_at: new Date().toISOString() }).eq("id", id)
    if (updateError) throw updateError
    return NextResponse.json({ success: true })
  } catch (error) {
    return commerceError(error)
  }
}
