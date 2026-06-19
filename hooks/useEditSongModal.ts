import { create } from "zustand"

import { Song } from "@/types"

interface EditSongModalStore {
  isOpen: boolean
  song: Song | null
  onUpdate: ((updated: Song) => void) | null
  onOpen: (song: Song, onUpdate: (updated: Song) => void) => void
  onClose: () => void
}

const useEditSongModal = create<EditSongModalStore>(set => ({
  isOpen: false,
  song: null,
  onUpdate: null,
  onOpen: (song, onUpdate) => set({ isOpen: true, song, onUpdate }),
  onClose: () => set({ isOpen: false, song: null, onUpdate: null }),
}))

export default useEditSongModal
