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
  setId: (id: string) => void
  setActiveSong: (song?: Song) => void
  setIsLoading: (isLoading: boolean) => void
  setIsPlaying: (isPlaying: boolean) => void
  setProgress: (progress: number) => void
  setPreloadedSongId: (songId?: string) => void
  setSongs: (songs: Song[]) => void
  setIds: (ids: string[]) => void
  setRepeatMode: (mode: RepeatMode) => void
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
  setId: (id: string) => set({ activeId: id }),
  setActiveSong: (song?: Song) => set({ activeSong: song }),
  setIsLoading: (isLoading: boolean) => set({ isLoading }),
  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
  setProgress: (progress: number) => set({ progress }),
  setPreloadedSongId: (preloadedSongId?: string) => set({ preloadedSongId }),
  setSongs: (songs: Song[]) => set({ songs }),
  setIds: (ids: string[]) => set({ ids }),
  setRepeatMode: (repeatMode: RepeatMode) => set({ repeatMode }),
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
    }),
}))

export default usePlayer
