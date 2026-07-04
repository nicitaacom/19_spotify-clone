import { create } from "zustand"
import { initialModalData, ModalData, TAreYouSureModals } from "@/ts/TAreYouSureModals"

// Promise-based confirmation modals. A caller does:
//   const confirmed = await openModal("areYouSureDeleteSong", { title })
//   if (!confirmed) return
// openModal resolves `true` on confirm and `false` on cancel/close, so any async action can `await`
// a real yes/no instead of the native window.confirm().
interface AreYouSureModals {
  isOpen: Record<TAreYouSureModals, boolean>
  modalData: ModalData
  currentModalId: TAreYouSureModals | null
  confirmationResolvers: Partial<Record<TAreYouSureModals, (value: boolean) => void>>

  openModal: <T extends TAreYouSureModals>(modalId: T, data?: ModalData[T]) => Promise<boolean>
  handleConfirm: () => void
  handleCancel: () => void
}

export const useAreYouSureModals = create<AreYouSureModals>()(set => ({
  isOpen: {
    areYouSureDeletePlaylist: false,
    areYouSureDeleteSong: false,
    areYouSureLogout: false,
  },
  currentModalId: null,
  modalData: initialModalData,
  confirmationResolvers: {},

  openModal: (modalId, data) => {
    return new Promise<boolean>(resolve => {
      set(state => ({
        isOpen: { ...state.isOpen, [modalId]: true },
        currentModalId: modalId,
        modalData: { ...state.modalData, [modalId]: data },
        confirmationResolvers: { ...state.confirmationResolvers, [modalId]: resolve },
      }))
    })
  },

  handleConfirm: () => {
    set(state => {
      const modalId = state.currentModalId
      if (!modalId) return state
      const resolver = state.confirmationResolvers[modalId]
      if (resolver) {
        resolver(true)
        delete state.confirmationResolvers[modalId]
      }
      return {
        isOpen: { ...state.isOpen, [modalId]: false },
        modalData: { ...state.modalData, [modalId]: initialModalData[modalId] },
        currentModalId: null,
      }
    })
  },

  handleCancel: () => {
    set(state => {
      const modalId = state.currentModalId
      if (!modalId) return state
      const resolver = state.confirmationResolvers[modalId]
      if (resolver) {
        resolver(false)
        delete state.confirmationResolvers[modalId]
      }
      return {
        isOpen: { ...state.isOpen, [modalId]: false },
        modalData: { ...state.modalData, [modalId]: initialModalData[modalId] },
        currentModalId: null,
      }
    })
  },
}))
