import "server-only"
import { cache } from "react"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { createServerComponentClient } from "@/libs/supabaseServer"
import { isOwnerId } from "@/libs/getOwnerIds"
import { DEFAULT_PLAYLIST_PRICE, isPlaylistPurchaseAvailable } from "@/libs/commerceRules"
import type { Playlist, PlaylistCommerce, Song } from "@/types"

export function isCommerceSchemaMissing(error: unknown) {
  const e = error as { code?: string; message?: string }
  return (
    ["42P01", "PGRST205"].includes(e?.code ?? "") &&
    /19_(playlist_commerce|playlist_orders|song_access)/.test(e?.message ?? "")
  )
}

export const getViewer = cache(async () => {
  const client = await createServerComponentClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  return { id: user?.id ?? null, isOwner: isOwnerId(user?.id) }
})

export async function purchasedPlaylists(userId: string | null) {
  if (!userId) return new Set<string>()
  const { data, error } = await admin
    .from("19_playlist_orders")
    .select("playlist_id")
    .eq("user_id", userId)
    .eq("status", "paid")
  if (error) throw error
  return new Set((data ?? []).map(order => order.playlist_id))
}

export async function getSongAccess(songIds: string[], viewer: { id: string | null; isOwner: boolean }) {
  if (!songIds.length) return new Map<string, Pick<Song, "is_paid" | "can_play" | "unlock_slug">>()
  const ids = Array.from(new Set(songIds)).map(Number)
  const [settings, memberships, purchases, songOwners] = await Promise.all([
    admin.from("19_song_access").select("*").in("song_id", ids),
    admin.from("19_playlist_songs").select("song_id, playlist_id").in("song_id", ids),
    purchasedPlaylists(viewer.id),
    admin.from("19_songs").select("id,user_id").in("id", ids),
  ])
  if (settings.error) throw settings.error
  if (memberships.error) throw memberships.error
  if (songOwners.error) throw songOwners.error
  const songOwnerById = new Map((songOwners.data ?? []).map(song => [String(song.id), song.user_id]))
  const playlistIds = Array.from(new Set((memberships.data ?? []).map(m => m.playlist_id)))
  const playlists = playlistIds.length
    ? await admin.from("19_playlists").select("id,slug,user_id,visibility").in("id", playlistIds)
    : { data: [], error: null }
  if (playlists.error) throw playlists.error
  const ownedPlaylists = new Set(
    (playlists.data ?? []).filter(playlist => viewer.id !== null && playlist.user_id === viewer.id).map(playlist => playlist.id),
  )
  const playlistVisibility = new Map((playlists.data ?? []).map(playlist => [playlist.id, playlist.visibility]))
  return new Map(
    songIds.map(id => {
      const memberIds = (memberships.data ?? []).filter(m => String(m.song_id) === id).map(m => m.playlist_id)
      const paidMemberIds = memberIds.filter(playlistId =>
        (settings.data ?? []).some(
          setting => setting.playlist_id === playlistId && String(setting.song_id) === id && setting.is_paid,
        ),
      )
      const hasFreeMembership = memberIds.some(
        playlistId =>
          !paidMemberIds.includes(playlistId) &&
          ((playlistVisibility.get(playlistId) === "public" || playlistVisibility.get(playlistId) === "unlisted") ||
            ownedPlaylists.has(playlistId)),
      )
      const source = (playlists.data ?? []).find(
        p => paidMemberIds.includes(p.id) && p.visibility !== "private" && isOwnerId(p.user_id)
      )
      return [
        id,
        {
          is_paid: paidMemberIds.length > 0,
          can_play:
            viewer.isOwner ||
            (viewer.id !== null && songOwnerById.get(id) === viewer.id) ||
            hasFreeMembership ||
            paidMemberIds.some(playlistId => purchases.has(playlistId) || ownedPlaylists.has(playlistId)),
          unlock_slug: source?.slug ?? null,
        },
      ]
    })
  )
}

function redactLockedPaidSong(song: Song): Song {
  if (!song.is_paid || song.can_play !== false) return song
  return {
    ...song,
    title: "Please pay instead of trying to hack",
    author: "",
    song_path: "",
    image_path: "",
    unlock_slug: null,
  }
}

export async function withSongAccess(songs: Song[]): Promise<Song[]> {
  try {
    const access = await getSongAccess(
      songs.map(song => String(song.id)),
      await getViewer()
    )
    const accessibleSongs = songs.map(song => ({ ...song, id: String(song.id), ...access.get(String(song.id)) }))
    return accessibleSongs.map(redactLockedPaidSong)
  } catch (error) {
    if (!isCommerceSchemaMissing(error)) throw error
    // Fail closed while commerce tables are being installed so no unknown paid metadata is sent.
    return songs.map(song => ({
      ...song,
      id: String(song.id),
      title: "Track unavailable",
      author: "",
      song_path: "",
      image_path: "",
      can_play: false,
      access_unavailable: true,
    }))
  }
}

export async function applyPlaylistSongAccess(
  playlistId: string,
  songs: Song[],
  viewer: { id: string | null; isOwner: boolean },
  canManage = false,
): Promise<Song[]> {
  if (!songs.length) return songs
  const ids = songs.map(song => Number(song.id))
  const [settings, purchases, songOwners] = await Promise.all([
    admin.from("19_song_access").select("song_id,is_paid").eq("playlist_id", playlistId).in("song_id", ids),
    purchasedPlaylists(viewer.id),
    admin.from("19_songs").select("id,user_id").in("id", ids),
  ])
  if (settings.error) throw settings.error
  if (songOwners.error) throw songOwners.error
  const rows = new Map((settings.data ?? []).map(row => [String(row.song_id), Boolean(row.is_paid)]))
  const songOwnerById = new Map((songOwners.data ?? []).map(song => [String(song.id), song.user_id]))
  const purchased = viewer.isOwner || canManage || purchases.has(playlistId)
  return songs.map(song => {
    const paid = rows.get(String(song.id)) ?? false
    return {
      ...song,
      is_paid: paid,
      can_play: viewer.isOwner || canManage || (viewer.id !== null && songOwnerById.get(String(song.id)) === viewer.id) || !paid || purchased,
      unlock_slug: paid && !purchased ? null : song.unlock_slug,
    }
  })
}

export async function getPlaylistCommerce(playlists: Playlist[]): Promise<Map<string, PlaylistCommerce>> {
  try {
    return await loadPlaylistCommerce(playlists)
  } catch (error) {
    if (!isCommerceSchemaMissing(error)) throw error
    const viewer = await getViewer()
    return new Map(
      playlists.map(p => [
        p.id,
        {
          ready: false,
          price_cents: DEFAULT_PLAYLIST_PRICE,
          sales_enabled: false,
          purchased: false,
          paid_song_count: 0,
          youtube_url: null,
          can_manage: viewer.isOwner && isOwnerId(p.user_id),
        },
      ])
    )
  }
}

async function loadPlaylistCommerce(playlists: Playlist[]): Promise<Map<string, PlaylistCommerce>> {
  if (!playlists.length) return new Map()
  const viewer = await getViewer()
  const ids = playlists.map(p => p.id)
  const [settings, memberships, purchases] = await Promise.all([
    admin.from("19_playlist_commerce").select("*").in("playlist_id", ids),
    admin.from("19_playlist_songs").select("playlist_id,song_id").in("playlist_id", ids),
    purchasedPlaylists(viewer.id),
  ])
  if (settings.error) throw settings.error
  if (memberships.error) throw memberships.error
  const songIds = Array.from(new Set((memberships.data ?? []).map(m => m.song_id)))
  const access = songIds.length
    ? await admin.from("19_song_access").select("playlist_id,song_id").eq("is_paid", true).in("playlist_id", ids).in("song_id", songIds)
    : { data: [], error: null }
  if (access.error) throw access.error
  return new Map(
    playlists.map(p => {
      const config = settings.data?.find(s => s.playlist_id === p.id)
      const canManage = viewer.isOwner && isOwnerId(p.user_id)
      const purchased = purchases.has(p.id)
      const paidSongCount = (memberships.data ?? []).filter(
        m => m.playlist_id === p.id && (access.data ?? []).some(a => a.playlist_id === p.id && a.song_id === m.song_id),
      ).length
      return [
        p.id,
        {
          ready: true,
          price_cents: config?.price_cents ?? DEFAULT_PLAYLIST_PRICE,
          sales_enabled: isPlaylistPurchaseAvailable({
            paidSongCount,
            visibility: p.visibility,
            ownedBySite: isOwnerId(p.user_id),
          }),
          purchased,
          paid_song_count: paidSongCount,
          youtube_url: canManage || purchased ? config?.youtube_url ?? null : null,
          can_manage: canManage,
        },
      ]
    })
  )
}
