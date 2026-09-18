import "server-only"
import { cache } from "react"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { createServerComponentClient } from "@/libs/supabaseServer"
import { isOwnerId } from "@/libs/getOwnerIds"
import { DEFAULT_PLAYLIST_PRICE } from "@/libs/commerceRules"
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
  const [settings, memberships, purchases] = await Promise.all([
    admin.from("19_song_access").select("*").in("song_id", ids),
    admin.from("19_playlist_songs").select("song_id, playlist_id").in("song_id", ids),
    purchasedPlaylists(viewer.id),
  ])
  if (settings.error) throw settings.error
  if (memberships.error) throw memberships.error
  const playlistIds = Array.from(new Set((memberships.data ?? []).map(m => m.playlist_id)))
  const [playlists, commerce] = playlistIds.length
    ? await Promise.all([
        admin.from("19_playlists").select("id,slug,user_id,visibility").in("id", playlistIds),
        admin.from("19_playlist_commerce").select("playlist_id,sales_enabled").in("playlist_id", playlistIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ]
  if (playlists.error) throw playlists.error
  if (commerce.error) throw commerce.error
  const available = new Set((commerce.data ?? []).filter(c => c.sales_enabled).map(c => c.playlist_id))
  return new Map(
    songIds.map(id => {
      const memberIds = (memberships.data ?? []).filter(m => String(m.song_id) === id).map(m => m.playlist_id)
      const paidMemberIds = memberIds.filter(playlistId =>
        (settings.data ?? []).some(
          setting => setting.playlist_id === playlistId && String(setting.song_id) === id && setting.is_paid,
        ),
      )
      const hasFreeMembership = memberIds.some(playlistId => !paidMemberIds.includes(playlistId))
      const source = (playlists.data ?? []).find(
        p => paidMemberIds.includes(p.id) && available.has(p.id) && p.visibility === "public" && isOwnerId(p.user_id)
      )
      return [
        id,
        {
          is_paid: paidMemberIds.length > 0,
          can_play: viewer.isOwner || hasFreeMembership || paidMemberIds.some(playlistId => purchases.has(playlistId)),
          unlock_slug: source?.slug ?? null,
        },
      ]
    })
  )
}

export async function withSongAccess(songs: Song[]): Promise<Song[]> {
  try {
    const access = await getSongAccess(
      songs.map(song => String(song.id)),
      await getViewer()
    )
    return songs.map(song => ({ ...song, id: String(song.id), ...access.get(String(song.id)) }))
  } catch (error) {
    if (!isCommerceSchemaMissing(error)) throw error
    // Catalog rendering can survive a staged deployment; audio still fails
    // closed at the playback endpoint until the schema is installed.
    return songs.map(song => ({ ...song, id: String(song.id), can_play: false, access_unavailable: true }))
  }
}

export async function applyPlaylistSongAccess(
  playlistId: string,
  songs: Song[],
  viewer: { id: string | null; isOwner: boolean },
): Promise<Song[]> {
  if (!songs.length) return songs
  const ids = songs.map(song => Number(song.id))
  const [settings, purchases] = await Promise.all([
    admin.from("19_song_access").select("song_id,is_paid").eq("playlist_id", playlistId).in("song_id", ids),
    purchasedPlaylists(viewer.id),
  ])
  if (settings.error) throw settings.error
  const rows = new Map((settings.data ?? []).map(row => [String(row.song_id), Boolean(row.is_paid)]))
  const purchased = viewer.isOwner || purchases.has(playlistId)
  return songs.map(song => {
    const paid = rows.get(String(song.id)) ?? false
    return {
      ...song,
      is_paid: paid,
      can_play: viewer.isOwner || !paid || purchased,
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
      return [
        p.id,
        {
          ready: true,
          price_cents: config?.price_cents ?? DEFAULT_PLAYLIST_PRICE,
          sales_enabled: Boolean(config?.sales_enabled && isOwnerId(p.user_id) && p.visibility !== "private"),
          purchased,
          paid_song_count: (memberships.data ?? []).filter(
            m => m.playlist_id === p.id && (access.data ?? []).some(a => a.playlist_id === p.id && a.song_id === m.song_id),
          ).length,
          youtube_url: canManage || purchased ? config?.youtube_url ?? null : null,
          can_manage: canManage,
        },
      ]
    })
  )
}
