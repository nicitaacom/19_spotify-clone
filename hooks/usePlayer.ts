import { create } from "zustand"

import { Song } from "@/types"

type RepeatMode = "off" | "all" | "one"

interface PlayerStore {
  songs: Song[]
  ids: string[]
  activeId?: string
  activeSong?: Song
  isLoading: boolean
  isPlaying: boolean
  progress: number
  preloadedSongId?: string
  playbackCommand?: "play" | "pause"
  playbackCommandId: number
  seek?: number
  seekId: number
  repeatMode: RepeatMode
  savedPosition: number
  sourcePlaylistId?: string
  startPlayback: (id: string, songs?: Song[], playlistId?: string) => void
  setActiveSong: (song?: Song) => void
  setIsLoading: (isLoading: boolean) => void
  setIsPlaying: (isPlaying: boolean) => void
  setProgress: (progress: number) => void
  setPreloadedSongId: (songId?: string) => void
  setRepeatMode: (mode: RepeatMode) => void
  setSavedPosition: (pos: number) => void
  togglePlayback: () => void
  stopPlayback: () => void
  requestPlaybackCommand: (command: "play" | "pause") => void
  requestSeek: (seek: number) => void
  reset: () => void
}

const usePlayer = create<PlayerStore>(set => ({
  songs: [],
  ids: [],
  activeId: undefined,
  activeSong: undefined,
  isLoading: false,
  isPlaying: false,
  progress: 0,
  preloadedSongId: undefined,
  playbackCommand: undefined,
  playbackCommandId: 0,
  seek: undefined,
  seekId: 0,
  repeatMode: "off",
  savedPosition: 0,
  sourcePlaylistId: undefined,
  startPlayback: (id: string, songs?: Song[], playlistId?: string) =>
    set(state => {
      const queue = songs ?? state.songs
      return {
        songs: queue,
        ids: songs ? queue.map(song => String(song.id)) : state.ids,
        activeId: id,
        activeSong: queue.find(song => String(song.id) === id),
        isLoading: true,
        isPlaying: false,
        progress: 0,
        savedPosition: 0,
        seek: undefined,
        playbackCommand: "play",
        playbackCommandId: state.playbackCommandId + 1,
        sourcePlaylistId: songs ? playlistId : state.sourcePlaylistId,
      }
    }),
  setActiveSong: (song?: Song) => set({ activeSong: song }),
  setIsLoading: (isLoading: boolean) => set({ isLoading }),
  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
  setProgress: (progress: number) => set({ progress }),
  setPreloadedSongId: (preloadedSongId?: string) => set({ preloadedSongId }),
  setRepeatMode: (repeatMode: RepeatMode) => set({ repeatMode }),
  setSavedPosition: (savedPosition: number) => set({ savedPosition }),
  togglePlayback: () =>
    set(state => ({
      playbackCommand: state.isPlaying ? "pause" : "play",
      playbackCommandId: state.playbackCommandId + 1,
    })),
  stopPlayback: () =>
    set(state => ({
      playbackCommand: "pause",
      playbackCommandId: state.playbackCommandId + 1,
      seek: 0,
      seekId: state.seekId + 1,
    })),
  requestPlaybackCommand: (playbackCommand: "play" | "pause") =>
    set(state => ({
      playbackCommand,
      playbackCommandId: state.playbackCommandId + 1,
    })),
  requestSeek: (seek: number) =>
    set(state => ({
      seek,
      seekId: state.seekId + 1,
    })),
  reset: () =>
    set({
      songs: [],
      ids: [],
      activeId: undefined,
      activeSong: undefined,
      isLoading: false,
      isPlaying: false,
      progress: 0,
      preloadedSongId: undefined,
      playbackCommand: undefined,
      playbackCommandId: 0,
      seek: undefined,
      seekId: 0,
      repeatMode: "off",
      savedPosition: 0,
      sourcePlaylistId: undefined,
    }),
}))

export default usePlayer
