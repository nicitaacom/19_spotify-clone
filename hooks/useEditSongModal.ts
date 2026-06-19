import { create } from "zustand"

import { Song } from "@/types"

interface EditSongModalStore {
  isOpen: boolean
  song: Song | null
  onOpen: (song: Song) => void
  onClose: () => void
}

const useEditSongModal = create<EditSongModalStore>(set => ({
  isOpen: false,
  song: null,
  onOpen: song => set({ isOpen: true, song }),
  onClose: () => set({ isOpen: false, song: null }),
}))

export default useEditSongModal
