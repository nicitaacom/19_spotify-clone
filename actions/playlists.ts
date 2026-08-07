import {
  Playlist,
  PlaylistAuthor,
  PlaylistDetail,
  PlaylistOption,
  PlaylistSongWithSong,
  PlaylistSummary,
  Song,
} from "@/types"

import { createServerComponentClient } from "@/libs/supabaseServer"
import supabaseAuthClient from "@/libs/supabaseAuthClient"

const FALLBACK_AUTHOR: PlaylistAuthor = {
  id: "",
  username: "unknown",
  full_name: null,
  avatar_url: null,
}

// The raw row shape as it comes back from Supabase, before normalizePlaylist coerces `id` to a
// string (Postgres returns it as a number) and fills in Playlist's other fields.
type RawPlaylistRow = Omit<Playlist, "id"> & { id: string | number }

const normalizePlaylist = (playlist: RawPlaylistRow): Playlist => ({
  id: String(playlist.id),
  created_at: playlist.created_at,
  updated_at: playlist.updated_at,
  user_id: playlist.user_id,
  slug: playlist.slug,
  title: playlist.title,
  description: playlist.description ?? null,
  visibility: playlist.visibility,
})

type RawPlaylistSongRow = {
  playlist_id: string | number
  song_id: string | number
  position: number
  created_at: string
  song: Omit<Song, "id"> & { id: string | number }
}

const normalizePlaylistSong = (item: RawPlaylistSongRow): PlaylistSongWithSong | null => {
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
  const { data, error } = await supabase.from("19_users").select("id, avatar_url, full_name").in("id", userIds)

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
        username: author.full_name ?? "unknown",
      },
    ]),
  )
}

export const getPlaylistSongsByPlaylistIds = async (playlistIds: string[]) => {
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
    // Supabase infers the `song:19_songs(*)` to-one join as an array even though the FK guarantees
    // one row, so the query result's static shape doesn't match the real single-object runtime shape.
    const normalizedItem = normalizePlaylistSong(item as unknown as RawPlaylistSongRow)

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
  playlist: RawPlaylistRow,
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
  } = await supabaseAuthClient.auth.getSession()

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
  } = await supabaseAuthClient.auth.getSession()

  if (!session?.user?.id) {
    return []
  }

  const { data, error } = await supabase
    .from("19_playlists")
    .select("id, slug, title, updated_at, visibility")
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
    slug: playlist.slug,
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
