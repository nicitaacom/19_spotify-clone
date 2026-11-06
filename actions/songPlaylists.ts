"use server"

import { getUserSongPlaylists } from "@/actions/playlists"

export async function getSongPlaylists(songId: string) {
  const bySong = await getUserSongPlaylists([songId])
  return bySong[String(songId)] ?? []
}
