import { create } from "zustand"

import { Song } from "@/types"

interface SuggestSongModalStore {
  isOpen: boolean
  song: Song | null
  onOpen: (song: Song) => void
  onClose: () => void
}

const useSuggestSongModal = create<SuggestSongModalStore>(set => ({
  isOpen: false,
  song: null,
  onOpen: song => set({ isOpen: true, song }),
  onClose: () => set({ isOpen: false, song: null }),
}))

export default useSuggestSongModal
