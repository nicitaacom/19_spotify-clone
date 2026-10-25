"use server"

import { createServerComponentClient } from "@/libs/supabaseServer"
import { Playlist, PlaylistOption, Song } from "@/types"
import { withSongAccess } from "@/libs/playlistAccess"
import { songTagSearchValues } from "@/libs/songTags"
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

    // Keep title, author, and tag search working while the tag-search RPC is unavailable.
    const tagValues = songTagSearchValues(normalizedQuery)
    const [titleResult, authorResult, tagResult] = await Promise.all([
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
      tagValues.length
        ? supabase
          .from("19_songs")
          .select("*")
          .overlaps("tags", tagValues)
          .order("created_at", { ascending: false })
          .limit(100)
        : Promise.resolve({ data: [] as Song[], error: null }),
    ])

    if (titleResult.error || authorResult.error) {
      console.log("searchSongsAndPlaylistsAction fallback error - ", titleResult.error?.message ?? authorResult.error?.message)
      return `Song search failed. Title query: ${titleResult.error?.message ?? "no message"}. Author query: ${authorResult.error?.message ?? "no message"}.`
    }

    if (tagResult.error) console.log("searchSongsAndPlaylistsAction tag fallback error - ", tagResult.error.message)

    const tagSongs = tagResult.error ? [] : ((tagResult.data as Song[] | null) ?? [])
    const uniqueSongs = new Map<string, Song>()
    for (const song of [
      ...((titleResult.data as Song[] | null) ?? []),
      ...((authorResult.data as Song[] | null) ?? []),
      ...tagSongs,
    ]) {
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
