"use client"

import { FiAlertTriangle } from "react-icons/fi"

import { ModalContainer } from "@/app/features/backup/ModalContainer"
import { useAreYouSureModals } from "@/store/modals/useAreYouSureModals"

interface AreYouSureModalProps {
  isOpen: boolean
  label: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
}

// Generic yes/no confirmation body. The provider passes the copy per modal id; confirm/cancel
// resolve the promise the caller is awaiting via the store.
export function AreYouSureModal({
  isOpen,
  label,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
}: AreYouSureModalProps) {
  const { handleConfirm, handleCancel } = useAreYouSureModals()

  return (
    <ModalContainer isOpen={isOpen} onClose={handleCancel} label={label} classNamePanel="max-w-[420px]">
      <div className="flex flex-col gap-y-5">
        <div className="flex items-start gap-x-3 text-sm text-neutral-300">
          <FiAlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="break-words">{message}</div>
        </div>

        <div className="flex gap-x-3">
          <button
            type="button"
            onClick={handleCancel}
            className="
              flex-1 rounded-md border border-white/10 bg-elevated px-4 py-2.5
              text-sm font-semibold text-neutral-300
              hover:bg-elevated/80 transition
            ">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="
              flex-1 rounded-md bg-red-500/90 px-4 py-2.5
              text-sm font-bold text-white
              hover:bg-red-500 transition
            ">
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalContainer>
  )
}
