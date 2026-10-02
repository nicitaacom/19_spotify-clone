import { create } from "zustand"

import { Song } from "@/types"

interface EditSongModalStore {
  isOpen: boolean
  song: Song | null
  playlistId: string | null
  onUpdate: ((updated: Song) => void) | null
  onOpen: (song: Song, onUpdate: (updated: Song) => void, playlistId?: string) => void
  onClose: () => void
}

const useEditSongModal = create<EditSongModalStore>(set => ({
  isOpen: false,
  song: null,
  playlistId: null,
  onUpdate: null,
  onOpen: (song, onUpdate, playlistId) => set({ isOpen: true, song, onUpdate, playlistId: playlistId ?? null }),
  onClose: () => set({ isOpen: false, song: null, playlistId: null, onUpdate: null }),
}))

export default useEditSongModal
