"use server"

import { getUserSongPlaylists } from "@/actions/playlists"

export async function getSongPlaylistMemberships(songId: string) {
  const bySong = await getUserSongPlaylists([songId])
  return bySong[String(songId)] ?? []
}
