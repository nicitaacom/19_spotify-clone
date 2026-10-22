import { useEffect, useState } from "react"
import supabaseClient from "@/libs/supabaseClient"
import { normalizeSongTags, recentPlaylistTags } from "@/libs/songTags"

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

export const usePlaylistRecentTags = (playlistId: string, enabled: boolean): PlaylistRecentTags => {
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
      const { data: playlistSongs, error: playlistSongError } = await supabaseClient
        .from("19_playlist_songs")
        .select("song_id, created_at")
        .eq("playlist_id", playlistId)
        .order("created_at", { ascending: false })
        .limit(8)

      if (ignore) return
      if (playlistSongError) {
        setSnapshot({ playlistId, ready: true, autofill: [], top: [], error: playlistSongError.message })
        return
      }

      const songIds = (playlistSongs ?? []).map(playlistSong => playlistSong.song_id)
      let songs: { id: number; tags: string[] | null }[] = []
      if (songIds.length) {
        const { data, error: songError } = await supabaseClient.from("19_songs").select("id, tags").in("id", songIds)
        if (ignore) return
        if (songError) {
          setSnapshot({ playlistId, ready: true, autofill: [], top: [], error: songError.message })
          return
        }
        songs = data ?? []
      }

      const tagsBySongId = new Map(songs.map(song => [song.id, tagsFromSong(song.tags)]))
      const ranked = recentPlaylistTags((playlistSongs ?? []).map(playlistSong => ({
        addedAt: playlistSong.created_at,
        tags: tagsBySongId.get(playlistSong.song_id) ?? [],
      })))
      setSnapshot({ playlistId, ready: true, autofill: ranked.autofill, top: ranked.top, error: "" })
    }

    readRecentTags()
    return () => { ignore = true }
  }, [enabled, playlistId])

  return current
}
