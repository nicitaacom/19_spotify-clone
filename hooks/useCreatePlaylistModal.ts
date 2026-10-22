import { create } from "zustand"

interface CreatePlaylistModalStore {
  isOpen: boolean
  skipRedirect: boolean
  initialTitle: string
  createdPlaylistId: string | null
  onOpen: (options?: { skipRedirect?: boolean; initialTitle?: string }) => void
  onClose: () => void
  setCreatedPlaylistId: (createdPlaylistId: string | null) => void
}

const useCreatePlaylistModal = create<CreatePlaylistModalStore>(set => ({
  isOpen: false,
  skipRedirect: false,
  initialTitle: "",
  createdPlaylistId: null,
  onOpen: (options) => set({
    isOpen: true,
    skipRedirect: options?.skipRedirect ?? false,
    initialTitle: options?.initialTitle ?? "",
    createdPlaylistId: null,
  }),
  onClose: () => set({ isOpen: false, skipRedirect: false }),
  setCreatedPlaylistId: (createdPlaylistId) => set({ createdPlaylistId }),
}))

export default useCreatePlaylistModal
