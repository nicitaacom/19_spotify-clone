"use server"

import { createServerComponentClient } from "@/libs/supabaseServer"
import { Playlist, Song } from "@/types"

const searchSongsAndPlaylistsAction = async (query: string): Promise<{ songs: Song[]; playlists: Playlist[] } | string> => {
  const supabase = await createServerComponentClient()

  if (!query) return { songs: [], playlists: [] }

  const [{ data: songs, error: songsError }, { data: playlists, error: playlistsError }] = await Promise.all([
    supabase
      .from("19_songs")
      .select("*")
      .or(`title.ilike.%${query}%,author.ilike.%${query}%`)
      .order("created_at", { ascending: false }),
    supabase.from("19_playlists").select("*").ilike("title", `%${query}%`).order("created_at", { ascending: false }),
  ])

  if (songsError) console.log("searchSongsAndPlaylistsAction songs error - ", songsError.message)
  if (playlistsError) console.log("searchSongsAndPlaylistsAction playlists error - ", playlistsError.message)

  return {
    songs: (songs as Song[]) ?? [],
    playlists: (playlists as Playlist[]) ?? [],
  }
}

export default searchSongsAndPlaylistsAction
