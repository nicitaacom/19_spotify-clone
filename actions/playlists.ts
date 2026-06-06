import {
  Playlist,
  PlaylistAuthor,
  PlaylistDetail,
  PlaylistOption,
  PlaylistSongWithSong,
  PlaylistSummary,
} from "@/types"

import { createServerComponentClient } from "@/libs/supabaseServer"

const FALLBACK_AUTHOR: PlaylistAuthor = {
  id: "",
  username: "unknown",
  full_name: null,
  avatar_url: null,
}

const normalizePlaylist = (playlist: Record<string, any>): Playlist => ({
  id: String(playlist.id),
  created_at: playlist.created_at,
  updated_at: playlist.updated_at,
  user_id: playlist.user_id,
  slug: playlist.slug,
  title: playlist.title,
  description: playlist.description ?? null,
  visibility: playlist.visibility,
})

const normalizePlaylistSong = (item: Record<string, any>): PlaylistSongWithSong | null => {
  if (!item?.song) {
    return null
  }

  return {
    playlist_id: String(item.playlist_id),
    song_id: String(item.song_id),
    position: item.position,
    created_at: item.created_at,
    song: {
      ...item.song,
      id: String(item.song.id),
    },
  }
}

const getAuthorsById = async (userIds: string[]) => {
  if (userIds.length === 0) {
    return new Map<string, PlaylistAuthor>()
  }

  const supabase = await createServerComponentClient()
  const { data, error } = await supabase
    .from("19_users")
    .select("id, avatar_url, full_name, username")
    .in("id", userIds)

  if (error || !data) {
    if (error) {
      console.log(48, "getAuthorsById error - ", error.message)
    }

    return new Map<string, PlaylistAuthor>()
  }

  return new Map<string, PlaylistAuthor>(
    data.map(author => [
      author.id,
      {
        id: author.id,
        avatar_url: author.avatar_url,
        full_name: author.full_name,
        username: author.username,
      },
    ]),
  )
}

const getPlaylistSongsByPlaylistIds = async (playlistIds: string[]) => {
  if (playlistIds.length === 0) {
    return new Map<string, PlaylistSongWithSong[]>()
  }

  const supabase = await createServerComponentClient()
  const { data, error } = await supabase
    .from("19_playlist_songs")
    .select("playlist_id, song_id, position, created_at, song:19_songs(*)")
    .in("playlist_id", playlistIds)
    .order("position", { ascending: true })

  if (error || !data) {
    if (error) {
      console.log(79, "getPlaylistSongsByPlaylistIds error - ", error.message)
    }

    return new Map<string, PlaylistSongWithSong[]>()
  }

  const playlistSongsMap = new Map<string, PlaylistSongWithSong[]>()

  data.forEach(item => {
    const normalizedItem = normalizePlaylistSong(item)

    if (!normalizedItem) {
      return
    }

    const existingItems = playlistSongsMap.get(normalizedItem.playlist_id) ?? []
    existingItems.push(normalizedItem)
    playlistSongsMap.set(normalizedItem.playlist_id, existingItems)
  })

  return playlistSongsMap
}

const buildPlaylistSummary = (
  playlist: Record<string, any>,
  authorsById: Map<string, PlaylistAuthor>,
  playlistSongsById: Map<string, PlaylistSongWithSong[]>,
): PlaylistSummary => {
  const normalizedPlaylist = normalizePlaylist(playlist)
  const playlistSongs = playlistSongsById.get(normalizedPlaylist.id) ?? []

  return {
    ...normalizedPlaylist,
    author: authorsById.get(normalizedPlaylist.user_id) ?? { ...FALLBACK_AUTHOR, id: normalizedPlaylist.user_id },
    cover_image_path: playlistSongs[0]?.song?.image_path ?? null,
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

  return data.map(playlist => buildPlaylistSummary(playlist, authorsById, playlistSongsById))
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

  return data.map(playlist => buildPlaylistSummary(playlist, authorsById, playlistSongsById))
}

export const getUserPlaylistOptions = async (): Promise<PlaylistOption[]> => {
  const supabase = await createServerComponentClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.id) {
    return []
  }

  const { data, error } = await supabase
    .from("19_playlists")
    .select("id, title, updated_at, visibility")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false })

  if (error || !data) {
    if (error) {
      console.log(184, "getUserPlaylistOptions error - ", error.message)
    }

    return []
  }

  return data.map(playlist => ({
    id: String(playlist.id),
    title: playlist.title,
    updated_at: playlist.updated_at,
    visibility: playlist.visibility,
  }))
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
  const [authorsById, playlistSongsById] = await Promise.all([
    getAuthorsById([normalizedPlaylist.user_id]),
    getPlaylistSongsByPlaylistIds([normalizedPlaylist.id]),
  ])

  const playlistSongs = playlistSongsById.get(normalizedPlaylist.id) ?? []

  return {
    ...normalizedPlaylist,
    author: authorsById.get(normalizedPlaylist.user_id) ?? { ...FALLBACK_AUTHOR, id: normalizedPlaylist.user_id },
    cover_image_path: playlistSongs[0]?.song?.image_path ?? null,
    songs: playlistSongs,
  }
}
