import { create } from "zustand"

interface DbBackupModalStore {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}

const useDbBackupModal = create<DbBackupModalStore>(set => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}))

export default useDbBackupModal
