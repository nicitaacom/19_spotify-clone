import { create } from "zustand"

interface CreatePlaylistModalStore {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}

const useCreatePlaylistModal = create<CreatePlaylistModalStore>(set => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}))

export default useCreatePlaylistModal
