import { create } from "zustand"

interface CreatePlaylistModalStore {
  isOpen: boolean
  skipRedirect: boolean
  onOpen: (options?: { skipRedirect?: boolean }) => void
  onClose: () => void
}

const useCreatePlaylistModal = create<CreatePlaylistModalStore>(set => ({
  isOpen: false,
  skipRedirect: false,
  onOpen: (options) => set({ isOpen: true, skipRedirect: options?.skipRedirect ?? false }),
  onClose: () => set({ isOpen: false, skipRedirect: false }),
}))

export default useCreatePlaylistModal
