import { useEffect, useState } from "react"
import { errorText } from "@/libs/errorText"
import supabaseClient from "@/libs/supabaseClient"
import { normalizeSongTags, popularPlaylistTags } from "@/libs/songTags"

export type PlaylistRecentTags = {
  playlistId: string
  ready: boolean
  autofill: string[]
  top: string[]
  error: string
}

const emptyTags = (playlistId: string): PlaylistRecentTags => ({
  playlistId,
  ready: false,
  autofill: [],
  top: [],
  error: "",
})

const tagsFromSong = (value: string[] | null): string[] => {
  if (!value?.length) return []
  const accepted: string[] = []
  for (const tag of value) {
    try { accepted.push(...normalizeSongTags([tag])) }
    catch { /* A stored tag the form would reject stays out of the suggestion list. */ }
  }
  return accepted
}

const PAGE_SIZE = 500

async function readPlaylistSongs(playlistId: string) {
  const rows: { song_id: number; created_at: string }[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseClient
      .from("19_playlist_songs")
      .select("song_id, created_at")
      .eq("playlist_id", playlistId)
      .order("created_at", { ascending: false })
      .order("song_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function readSongsTags(songIds: number[]) {
  const songs: { id: number; tags: string[] | null }[] = []
  for (let offset = 0; offset < songIds.length; offset += PAGE_SIZE) {
    const { data, error } = await supabaseClient
      .from("19_songs")
      .select("id, tags")
      .in("id", songIds.slice(offset, offset + PAGE_SIZE))
    if (error) throw error
    songs.push(...(data ?? []))
  }
  return songs
}

export const usePlaylistRecentTags = (playlistId: string, enabled: boolean, refetchKey = 0): PlaylistRecentTags => {
  const [snapshot, setSnapshot] = useState<PlaylistRecentTags>(() => emptyTags(playlistId))
  const [seenPlaylistId, setSeenPlaylistId] = useState(playlistId)
  if (playlistId !== seenPlaylistId) {
    setSeenPlaylistId(playlistId)
    setSnapshot(emptyTags(playlistId))
  }
  const current = playlistId === snapshot.playlistId ? snapshot : emptyTags(playlistId)

  useEffect(() => {
    if (!enabled || !playlistId) return
    let ignore = false

    const readRecentTags = async () => {
      let playlistSongs: { song_id: number; created_at: string }[]
      let songs: { id: number; tags: string[] | null }[]
      try {
        playlistSongs = await readPlaylistSongs(playlistId)
        if (ignore) return
        const songIds = Array.from(new Set(playlistSongs.map(playlistSong => playlistSong.song_id)))
        songs = await readSongsTags(songIds)
      } catch (error) {
        if (ignore) return
        setSnapshot({ playlistId, ready: true, autofill: [], top: [], error: errorText(error) })
        return
      }

      if (ignore) return

      const tagsBySongId = new Map(songs.map(song => [song.id, tagsFromSong(song.tags)]))
      const ranked = popularPlaylistTags(playlistSongs.map(playlistSong => ({
        addedAt: playlistSong.created_at,
        tags: tagsBySongId.get(playlistSong.song_id) ?? [],
      })))
      setSnapshot({ playlistId, ready: true, autofill: ranked.autofill, top: ranked.top, error: "" })
    }

    readRecentTags()
    return () => { ignore = true }
  }, [enabled, playlistId, refetchKey])

  return current
}
