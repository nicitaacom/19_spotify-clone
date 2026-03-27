import { create } from "zustand"

import { Song } from "@/types"

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
  setId: (id: string) => void
  setActiveSong: (song?: Song) => void
  setIsLoading: (isLoading: boolean) => void
  setIsPlaying: (isPlaying: boolean) => void
  setProgress: (progress: number) => void
  setPreloadedSongId: (songId?: string) => void
  setSongs: (songs: Song[]) => void
  setIds: (ids: string[]) => void
  requestPlaybackCommand: (command: "play" | "pause") => void
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
  setId: (id: string) => set({ activeId: id }),
  setActiveSong: (song?: Song) => set({ activeSong: song }),
  setIsLoading: (isLoading: boolean) => set({ isLoading }),
  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
  setProgress: (progress: number) => set({ progress }),
  setPreloadedSongId: (preloadedSongId?: string) => set({ preloadedSongId }),
  setSongs: (songs: Song[]) => set({ songs }),
  setIds: (ids: string[]) => set({ ids }),
  requestPlaybackCommand: (playbackCommand: "play" | "pause") =>
    set(state => ({
      playbackCommand,
      playbackCommandId: state.playbackCommandId + 1,
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
    }),
}))

export default usePlayer
