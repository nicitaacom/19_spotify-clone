import { PlaylistSummary } from "@/types"
import { createServerComponentClient } from "@/libs/supabaseServer"

import { getPublicPlaylists, getPlaylistSongsByPlaylistIds } from "./playlists"

const getRankedPlaylistsAction = async (): Promise<PlaylistSummary[]> => {
  const playlists = await getPublicPlaylists()

  if (playlists.length === 0) return []

  const playlistSongsById = await getPlaylistSongsByPlaylistIds(playlists.map(playlist => playlist.id))
  const allSongIds = Array.from(new Set(Array.from(playlistSongsById.values()).flat().map(item => item.song_id)))

  if (allSongIds.length === 0) {
    return playlists.map(playlist => ({ ...playlist, score: 0 })).sort((a, b) => b.score! - a.score!)
  }

  const supabase = await createServerComponentClient()
  const [{ data: plays, error: playsError }, { data: likes, error: likesError }] = await Promise.all([
    supabase.from("song_plays").select("song_id").in("song_id", allSongIds),
    supabase.from("19_liked_songs").select("song_id").in("song_id", allSongIds),
  ])

  if (playsError) console.log("getRankedPlaylistsAction plays error - ", playsError.message)
  if (likesError) console.log("getRankedPlaylistsAction likes error - ", likesError.message)

  const scoreBySongId = new Map<string, number>()

  const addScore = (songId: number | string) => {
    const key = String(songId)
    scoreBySongId.set(key, (scoreBySongId.get(key) ?? 0) + 1)
  }

  ;(plays ?? []).forEach(play => addScore(play.song_id))
  ;(likes ?? []).forEach(like => addScore(like.song_id))

  const rankedPlaylists = playlists.map(playlist => {
    const playlistSongs = playlistSongsById.get(playlist.id) ?? []
    const score = playlistSongs.reduce((total, item) => total + (scoreBySongId.get(String(item.song_id)) ?? 0), 0)
    return { ...playlist, score }
  })

  return rankedPlaylists.sort((a, b) => b.score! - a.score!)
}

export default getRankedPlaylistsAction
