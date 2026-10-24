"use server"

import { createServerComponentClient } from "@/libs/supabaseServer"
import { Playlist, PlaylistOption, Song } from "@/types"
import { withSongAccess } from "@/libs/playlistAccess"
import { getUserSongPlaylists } from "@/actions/playlists"

type SongPlaylistRef = Pick<PlaylistOption, "id" | "slug" | "title">

const searchSongsAndPlaylistsAction = async (
  query: string,
): Promise<{ songs: Song[]; playlists: Playlist[]; songPlaylists: Record<string, SongPlaylistRef[]> } | string> => {
  const supabase = await createServerComponentClient()
  const normalizedQuery = query.trim().slice(0, 200)

  if (!normalizedQuery) return { songs: [], playlists: [], songPlaylists: {} }

  const [{ data: rpcSongs, error: songsError }, { data: playlists, error: playlistsError }] = await Promise.all([
    supabase
      .rpc("search_music_songs", { p_query: normalizedQuery }),
    supabase.from("19_playlists").select("*").ilike("title", `%${normalizedQuery}%`).order("created_at", { ascending: false }),
  ])

  let songs = (rpcSongs as Song[] | null) ?? []

  if (songsError) {
    console.log("searchSongsAndPlaylistsAction RPC error - ", songsError.message)

    // Keep title/author search working while the optional tag-search RPC is unavailable.
    const [titleResult, authorResult] = await Promise.all([
      supabase
        .from("19_songs")
        .select("*")
        .ilike("title", `%${normalizedQuery}%`)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("19_songs")
        .select("*")
        .ilike("author", `%${normalizedQuery}%`)
        .order("created_at", { ascending: false })
        .limit(100),
    ])

    if (titleResult.error || authorResult.error) {
      console.log("searchSongsAndPlaylistsAction fallback error - ", titleResult.error?.message ?? authorResult.error?.message)
      return `Song search failed. Title query: ${titleResult.error?.message ?? "no message"}. Author query: ${authorResult.error?.message ?? "no message"}.`
    }

    const uniqueSongs = new Map<string, Song>()
    for (const song of [...((titleResult.data as Song[] | null) ?? []), ...((authorResult.data as Song[] | null) ?? [])]) {
      uniqueSongs.set(String(song.id), song)
    }

    songs = Array.from(uniqueSongs.values())
      .sort((first, second) => (second.created_at ?? "").localeCompare(first.created_at ?? ""))
      .slice(0, 100)
  }

  if (playlistsError) console.log("searchSongsAndPlaylistsAction playlists error - ", playlistsError.message)

  const [songsWithAccess, songPlaylists] = await Promise.all([
    withSongAccess(songs),
    getUserSongPlaylists(songs.map(song => String(song.id))),
  ])

  return {
    songs: songsWithAccess,
    playlists: (playlists as Playlist[]) ?? [],
    songPlaylists,
  }
}

export default searchSongsAndPlaylistsAction
