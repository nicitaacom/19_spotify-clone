import { create } from "zustand"

import { Song } from "@/types"

interface PlayerStore {
  songs: Song[]
  ids: string[]
  activeId?: string
  activeSong?: Song
  isLoading: boolean
  progress: number
  preloadedSongId?: string
  setId: (id: string) => void
  setActiveSong: (song?: Song) => void
  setIsLoading: (isLoading: boolean) => void
  setProgress: (progress: number) => void
  setPreloadedSongId: (songId?: string) => void
  setSongs: (songs: Song[]) => void
  setIds: (ids: string[]) => void
  reset: () => void
}

const usePlayer = create<PlayerStore>(set => ({
  songs: [],
  ids: [],
  activeId: undefined,
  activeSong: undefined,
  isLoading: false,
  progress: 0,
  preloadedSongId: undefined,
  setId: (id: string) => set({ activeId: id }),
  setActiveSong: (song?: Song) => set({ activeSong: song }),
  setIsLoading: (isLoading: boolean) => set({ isLoading }),
  setProgress: (progress: number) => set({ progress }),
  setPreloadedSongId: (preloadedSongId?: string) => set({ preloadedSongId }),
  setSongs: (songs: Song[]) => set({ songs }),
  setIds: (ids: string[]) => set({ ids }),
  reset: () =>
    set({
      songs: [],
      ids: [],
      activeId: undefined,
      activeSong: undefined,
      isLoading: false,
      progress: 0,
      preloadedSongId: undefined,
    }),
}))

export default usePlayer
