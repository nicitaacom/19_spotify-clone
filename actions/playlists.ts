import {
  Playlist,
  PlaylistAuthor,
  PlaylistDetail,
  PlaylistOption,
  PlaylistSummary,
  Song,
} from "@/types"

import { createServerComponentClient } from "@/libs/supabaseServer"
import { commerceAdmin } from "@/libs/commerceAdmin"
import { isOwnerId } from "@/libs/getOwnerIds"
import { isSupabaseGatewayUnauthorized, logSupabaseServiceRoleRejected } from "@/libs/supabaseGatewayError"
import {
  applyPlaylistSongAccess,
  getPlaylistCommerce,
  getViewer,
  isCommerceSchemaMissing,
  purchasedPlaylists,
} from "@/libs/playlistAccess"

const FALLBACK_AUTHOR: PlaylistAuthor = {
  id: "",
  username: "unknown",
  full_name: null,
  avatar_url: null,
}

// The raw row shape as it comes back from Supabase, before normalizePlaylist coerces `id` to a
// string (Postgres returns it as a number) and fills in Playlist's other fields.
type RawPlaylistRow = Omit<Playlist, "id"> & { id: string | number }
type RawPlaylistMembershipRow = {
  playlist_id: string | number
  song_id: string | number
  position: number
  created_at: string
}
type PlaylistSongCover = {
  playlist_id: string
  song_id: string
  position: number
  created_at: string
  song: { id: string; image_path: string | null } | null
}

const normalizePlaylist = (playlist: RawPlaylistRow): Playlist => ({
  id: String(playlist.id),
  created_at: playlist.created_at,
  updated_at: playlist.updated_at,
  user_id: playlist.user_id,
  slug: playlist.slug,
  title: playlist.title,
  description: playlist.description ?? null,
  visibility: playlist.visibility,
  cover_image_path: playlist.cover_image_path ?? null,
})

const getAuthorsById = async (userIds: string[]) => {
  if (userIds.length === 0) {
    return new Map<string, PlaylistAuthor>()
  }

  const { data, error } = await commerceAdmin.from("19_users").select("id, avatar_url, full_name").in("id", userIds)

  if (error || !data) {
    if (error && error.message !== "Unauthorized") {
      console.log(48, "getAuthorsById error - ", error.message)
    }

    return new Map<string, PlaylistAuthor>()
  }

  const profiles = new Map(data.map(author => [author.id, author]))
  const missingNames = userIds.filter(id => !profiles.get(id)?.full_name?.trim())
  const fallbackNames = await Promise.all(missingNames.map(async id => {
    const { data: account, error: accountError } = await commerceAdmin.auth.admin.getUserById(id)
    if (accountError) return [id, "unknown"] as const
    const metadata = account.user?.user_metadata
    const name = metadata?.full_name || metadata?.name || metadata?.user_name ||
      (isOwnerId(id) ? account.user?.email?.split("@")[0] : null)
    return [id, typeof name === "string" && name.trim() ? name.trim() : "unknown"] as const
  }))
  const names = new Map(fallbackNames)
  return new Map<string, PlaylistAuthor>(userIds.map(id => {
    const profile = profiles.get(id)
    const fullName = profile?.full_name?.trim() || null
    return [id, {
      id,
      avatar_url: profile?.avatar_url ?? null,
      full_name: fullName,
      username: fullName || names.get(id) || "unknown",
    }]
  }))
}

export const getPlaylistSongsByPlaylistIds = async (playlistIds: string[]) => {
  if (playlistIds.length === 0) {
    return new Map<string, PlaylistSongCover[]>()
  }

  const supabase = await createServerComponentClient()
  const { data, error } = await supabase
    .from("19_playlist_songs")
    .select("playlist_id, song_id, position, created_at")
    .in("playlist_id", playlistIds)
    .order("position", { ascending: true })

  if (error || !data) {
    if (error) {
      console.log(79, "getPlaylistSongsByPlaylistIds error - ", error.message)
    }

    return new Map<string, PlaylistSongCover[]>()
  }

  const memberships = data as unknown as RawPlaylistMembershipRow[]
  if (!memberships.length) return new Map<string, PlaylistSongCover[]>()

  const songIds = Array.from(new Set(memberships.map(item => Number(item.song_id))))
  const viewer = await getViewer()
  let purchases = new Set<string>()
  try {
    purchases = await purchasedPlaylists(viewer.id)
  } catch (purchaseError) {
    if (!isCommerceSchemaMissing(purchaseError)) throw purchaseError
  }

  const [{ data: playlistRows, error: playlistError }, accessResult, { data: songOwners, error: songOwnersError }] = await Promise.all([
    commerceAdmin.from("19_playlists").select("id,user_id,visibility").in("id", playlistIds),
    commerceAdmin.from("19_song_access").select("playlist_id,song_id").eq("is_paid", true).in("playlist_id", playlistIds).in("song_id", songIds),
    commerceAdmin.from("19_songs").select("id,user_id").in("id", songIds),
  ])
  const adminDenied = [playlistError, songOwnersError, accessResult.error].some(queryError => queryError?.message === "Unauthorized")
  if (adminDenied) {
    const { data: publicSongs, error: publicSongsError } = await supabase
      .from("19_songs")
      .select("id, image_path")
      .in("id", songIds)
    if (publicSongsError) {
      console.log(79, "public song covers error - ", publicSongsError.message)
      return new Map<string, PlaylistSongCover[]>()
    }
    const publicImages = new Map((publicSongs ?? []).map(song => [String(song.id), song.image_path as string | null]))
    const publicSongsMap = new Map<string, PlaylistSongCover[]>()
    for (const item of memberships) {
      const playlistId = String(item.playlist_id)
      const songId = String(item.song_id)
      const existingItems = publicSongsMap.get(playlistId) ?? []
      existingItems.push({
        playlist_id: playlistId,
        song_id: songId,
        position: item.position,
        created_at: item.created_at,
        song: publicImages.has(songId) ? { id: songId, image_path: publicImages.get(songId) ?? null } : null,
      })
      publicSongsMap.set(playlistId, existingItems)
    }
    return publicSongsMap
  }
  if (playlistError) throw playlistError
  if (songOwnersError) throw songOwnersError
  const accessUnavailable = Boolean(accessResult.error && isCommerceSchemaMissing(accessResult.error))
  if (accessResult.error && !accessUnavailable) throw accessResult.error

  const playlistsById = new Map((playlistRows ?? []).map(row => [String(row.id), row]))
  const songOwnersById = new Map((songOwners ?? []).map(song => [String(song.id), song.user_id]))
  const paidRows = accessUnavailable ? [] : accessResult.data ?? []
  const paidMemberships = new Set(paidRows.map(row => `${row.playlist_id}:${row.song_id}`))
  const canSeeSong = (playlistId: string, songId: string) => {
    const paid = paidMemberships.has(`${playlistId}:${songId}`)
    const playlist = playlistsById.get(playlistId)
    const ownsPlaylist = viewer.id !== null && playlist?.user_id === viewer.id
    const ownsSong = viewer.id !== null && songOwnersById.get(songId) === viewer.id
    return viewer.isOwner || ownsPlaylist || ownsSong || purchases.has(playlistId) ||
      (!accessUnavailable && !paid && (playlist?.visibility === "public" || playlist?.visibility === "unlisted"))
  }
  const visibleSongIds = Array.from(new Set(memberships
    .filter(item => canSeeSong(String(item.playlist_id), String(item.song_id)))
    .map(item => String(item.song_id))))
  const { data: songRows, error: songsError } = visibleSongIds.length
    ? await commerceAdmin.from("19_songs").select("id,image_path").in("id", visibleSongIds.map(Number))
    : { data: [], error: null }
  if (songsError) throw songsError
  const images = new Map((songRows ?? []).map(song => [String(song.id), song.image_path as string | null]))

  const playlistSongsMap = new Map<string, PlaylistSongCover[]>()
  for (const item of memberships) {
    const playlistId = String(item.playlist_id)
    const songId = String(item.song_id)
    const existingItems = playlistSongsMap.get(playlistId) ?? []
    existingItems.push({
      playlist_id: playlistId,
      song_id: songId,
      position: item.position,
      created_at: item.created_at,
      song: canSeeSong(playlistId, songId) ? { id: songId, image_path: images.get(songId) ?? null } : null,
    })
    playlistSongsMap.set(playlistId, existingItems)
  }
  return playlistSongsMap
}

const buildPlaylistSummary = (
  playlist: RawPlaylistRow,
  authorsById: Map<string, PlaylistAuthor>,
  playlistSongsById: Map<string, PlaylistSongCover[]>,
): PlaylistSummary => {
  const normalizedPlaylist = normalizePlaylist(playlist)
  const playlistSongs = playlistSongsById.get(normalizedPlaylist.id) ?? []

  return {
    ...normalizedPlaylist,
    author: authorsById.get(normalizedPlaylist.user_id) ?? { ...FALLBACK_AUTHOR, id: normalizedPlaylist.user_id },
    cover_image_path: normalizedPlaylist.cover_image_path ?? playlistSongs.find(item => item.song?.image_path)?.song?.image_path ?? null,
    song_count: playlistSongs.length,
  }
}

export const getPublicPlaylists = async (): Promise<PlaylistSummary[]> => {
  const supabase = await createServerComponentClient()
  const { data, error } = await supabase
    .from("19_playlists")
    .select("*")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })

  if (error || !data) {
    if (error) {
      console.log(120, "getPublicPlaylists error - ", error.message)
    }

    return []
  }

  const playlistIds = data.map(playlist => String(playlist.id))
  const userIds = Array.from(new Set(data.map(playlist => playlist.user_id)))
  const [authorsById, playlistSongsById] = await Promise.all([
    getAuthorsById(userIds),
    getPlaylistSongsByPlaylistIds(playlistIds),
  ])

  const summaries = data.map(playlist => buildPlaylistSummary(playlist, authorsById, playlistSongsById))
  const commerce = await getPlaylistCommerce(summaries)
  return summaries.map(p => ({ ...p, commerce: commerce.get(p.id) }))
}

export const getUserPlaylists = async (): Promise<PlaylistSummary[]> => {
  const supabase = await createServerComponentClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.id) {
    return []
  }

  const { data, error } = await supabase
    .from("19_playlists")
    .select("*")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false })

  if (error || !data) {
    if (error) {
      console.log(152, "getUserPlaylists error - ", error.message)
    }

    return []
  }

  const playlistIds = data.map(playlist => String(playlist.id))
  const authorsById = await getAuthorsById([session.user.id])
  const playlistSongsById = await getPlaylistSongsByPlaylistIds(playlistIds)

  const summaries = data.map(playlist => buildPlaylistSummary(playlist, authorsById, playlistSongsById))
  const commerce = await getPlaylistCommerce(summaries)
  return summaries.map(p => ({ ...p, commerce: commerce.get(p.id) }))
}

export const getUserSongPlaylists = async (songIds: string[]): Promise<Record<string, Pick<PlaylistOption, "id" | "slug" | "title">[]>> => {
  if (!songIds.length) return {}
  const supabase = await createServerComponentClient()
  const numericSongIds = Array.from(new Set(songIds.map(id => Number(id)).filter(id => Number.isInteger(id))))
  if (!numericSongIds.length) return {}

  const memberships: { playlist_id: string; song_id: number }[] = []
  for (let start = 0; start < numericSongIds.length; start += 100) {
    const { data, error } = await supabase
      .from("19_playlist_songs")
      .select("playlist_id, song_id")
      .in("song_id", numericSongIds.slice(start, start + 100))

    if (error) {
      console.log("getUserSongPlaylists error - ", error.message)
      return {}
    }
    memberships.push(...(data ?? []))
  }
  if (!memberships.length) return {}

  const playlistIds = Array.from(new Set(memberships.map(item => item.playlist_id)))
  const { data: playlists, error } = await supabase
    .from("19_playlists")
    .select("id, slug, title")
    .in("id", playlistIds)

  if (error || !playlists) {
    if (error) console.log("getUserSongPlaylists playlists error - ", error.message)
    return {}
  }

  const playlistsById = new Map(playlists.map(playlist => [String(playlist.id), playlist]))
  const result: Record<string, Pick<PlaylistOption, "id" | "slug" | "title">[]> = {}
  for (const item of memberships) {
    const playlist = playlistsById.get(String(item.playlist_id))
    if (!playlist) continue
    const locations = (result[String(item.song_id)] ??= [])
    if (locations.some(location => location.id === String(playlist.id))) continue
    locations.push({ id: String(playlist.id), slug: playlist.slug, title: playlist.title })
  }
  for (const locations of Object.values(result)) {
    locations.sort((a, b) => a.title.localeCompare(b.title))
  }
  return result
}

export const getPlaylistBySlug = async (slug: string): Promise<PlaylistDetail | null> => {
  const supabase = await createServerComponentClient()
  const { data, error } = await supabase.from("19_playlists").select("*").eq("slug", slug).maybeSingle()

  if (error || !data) {
    if (error) {
      console.log(203, "getPlaylistBySlug error - ", error.message)
    }

    return null
  }

  const normalizedPlaylist = normalizePlaylist(data)
  const [authorsById, commerce, viewer, membershipsResult] = await Promise.all([
    getAuthorsById([normalizedPlaylist.user_id]),
    getPlaylistCommerce([normalizedPlaylist]),
    getViewer(),
    supabase
      .from("19_playlist_songs")
      .select("playlist_id, song_id, position, created_at")
      .eq("playlist_id", normalizedPlaylist.id)
      .order("position", { ascending: true }),
  ])
  if (membershipsResult.error) throw membershipsResult.error
  const memberships = (membershipsResult.data ?? []) as unknown as RawPlaylistMembershipRow[]
  const playlistCommerce = commerce.get(normalizedPlaylist.id)
  const canManage = viewer.id === normalizedPlaylist.user_id || Boolean(playlistCommerce?.can_manage)
  if (normalizedPlaylist.visibility === "private" && !canManage) return null

  const songAccessSeeds: Song[] = memberships.map(item => ({
    id: String(item.song_id),
    user_id: "",
    author: "",
    title: "",
    song_path: "",
    image_path: "",
  }))
  let songAccess: Song[]
  let accessUnavailable = false
  try {
    songAccess = await applyPlaylistSongAccess(normalizedPlaylist.id, songAccessSeeds, viewer, canManage)
  } catch (error) {
    if (isSupabaseGatewayUnauthorized(error)) logSupabaseServiceRoleRejected()
    if (!isCommerceSchemaMissing(error) && !isSupabaseGatewayUnauthorized(error)) throw error
    accessUnavailable = true
    songAccess = songAccessSeeds.map(song => ({ ...song, can_play: false, access_unavailable: true }))
  }

  const visibleSongIds = Array.from(new Set(songAccess.filter(song => song.can_play === true).map(song => song.id)))
  const { data: songRows, error: songError } = visibleSongIds.length
    ? await commerceAdmin
        .from("19_songs")
        .select("id, user_id, author, title, song_path, image_path")
        .in("id", visibleSongIds.map(Number))
    : { data: [], error: null }
  if (songError && isSupabaseGatewayUnauthorized(songError)) logSupabaseServiceRoleRejected()
  if (songError && !isSupabaseGatewayUnauthorized(songError)) throw songError
  const songsById = new Map((songRows ?? []).map(song => [String(song.id), song]))

  const playlistSongs: Song[] = songAccess.map(song => {
    if (accessUnavailable) {
      return {
        ...song,
        title: "Track unavailable",
        author: "",
        song_path: "",
        image_path: "",
        is_paid: false,
        can_play: false,
        access_unavailable: true,
      }
    }
    if (song.can_play !== true) {
      return {
        ...song,
        title: "Please pay instead of trying to hack",
        author: "",
        song_path: "",
        image_path: "",
        is_paid: true,
        can_play: false,
        unlock_slug: null,
      }
    }
    const visibleSong = songsById.get(song.id)
    if (!visibleSong) {
      return {
        ...song,
        title: "Track unavailable",
        author: "",
        song_path: "",
        image_path: "",
        can_play: false,
        access_unavailable: true,
      }
    }
    return {
      ...song,
      ...visibleSong,
      id: String(visibleSong.id),
      user_id: visibleSong.user_id ?? "",
      author: visibleSong.author ?? "",
      title: visibleSong.title ?? "",
      song_path: visibleSong.song_path ?? "",
      image_path: visibleSong.image_path ?? "",
    }
  })

  return {
    ...normalizedPlaylist,
    author: authorsById.get(normalizedPlaylist.user_id) ?? { ...FALLBACK_AUTHOR, id: normalizedPlaylist.user_id },
    cover_image_path: normalizedPlaylist.cover_image_path ?? playlistSongs.find(song => song.can_play === true && song.image_path)?.image_path ?? null,
    songs: memberships.map((item, index) => ({
      playlist_id: String(item.playlist_id),
      song_id: String(item.song_id),
      position: item.position,
      created_at: item.created_at,
      song: playlistSongs[index],
    })),
    commerce: playlistCommerce,
  }
}

export const getPurchasedPlaylists = async (): Promise<PlaylistSummary[]> => {
  let ids: string[]
  try { ids = Array.from(await purchasedPlaylists((await getViewer()).id)) }
  catch (error) {
    if (isCommerceSchemaMissing(error)) return []
    if (isSupabaseGatewayUnauthorized(error)) {
      logSupabaseServiceRoleRejected()
      return []
    }
    throw error
  }
  if (!ids.length) return []
  const supabase = await createServerComponentClient()
  const { data, error } = await supabase.from("19_playlists").select("*").in("id", ids)
  if (error) throw error
  const [authors, songs] = await Promise.all([
    getAuthorsById(Array.from(new Set((data ?? []).map(p => p.user_id)))),
    getPlaylistSongsByPlaylistIds(ids),
  ])
  const summaries = (data ?? []).map(p => buildPlaylistSummary(p, authors, songs))
  const commerce = await getPlaylistCommerce(summaries)
  return summaries.map(p => ({ ...p, commerce: commerce.get(p.id) }))
}
