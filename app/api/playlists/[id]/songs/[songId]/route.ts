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

    const [{ data: members, error: membersError }, { data: access, error: accessError }, { data: orders, error: ordersError }] = await Promise.all([
      admin.from("19_playlist_songs").select("song_id").eq("playlist_id", id),
      admin.from("19_song_access").select("song_id,is_paid").eq("playlist_id", id),
      admin.from("19_playlist_orders").select("id").eq("playlist_id", id).in("status", ["pending", "paid", "suspended"]).limit(1),
    ])
    if (membersError || accessError || ordersError) throw membersError ?? accessError ?? ordersError
    const memberIds = new Set((members ?? []).map(item => String(item.song_id)))
    if (!memberIds.has(songId)) return NextResponse.json({ error: "Track not found in this playlist." }, { status: 404 })
    const paidMembers = (access ?? []).filter(item => item.is_paid && memberIds.has(String(item.song_id)))
    if (orders?.length && paidMembers.length === 1 && String(paidMembers[0].song_id) === songId) {
      return NextResponse.json({ error: "Keep at least one paid track while this playlist has an active purchase." }, { status: 409 })
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
