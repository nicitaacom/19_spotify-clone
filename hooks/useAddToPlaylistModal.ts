import { create } from "zustand"

import { Song } from "@/types"

interface AddToPlaylistModalStore {
  isOpen: boolean
  song: Song | null
  onOpen: (song: Song) => void
  onClose: () => void
}

const useAddToPlaylistModal = create<AddToPlaylistModalStore>(set => ({
  isOpen: false,
  song: null,
  onOpen: song => set({ isOpen: true, song }),
  onClose: () => set({ isOpen: false, song: null }),
}))

export default useAddToPlaylistModal
