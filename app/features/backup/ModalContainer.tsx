"use client"

import { useCallback, useEffect, useRef } from "react"
import { IoMdClose } from "react-icons/io"
import { twMerge } from "tailwind-merge"
import { AnimatePresence, motion } from "framer-motion"

// A self-contained modal shell — no Radix Dialog dependency, so it's copy-pastable and does not tie
// callers to a portal library. It renders its own backdrop + centered panel with framer-motion
// enter/exit animations. Closing on a backdrop click only fires when the mousedown ALSO started on
// the backdrop, so a text selection or drag that begins inside the panel and releases on the
// backdrop does not close the modal.
interface ModalContainerProps {
  isOpen: boolean
  onClose: () => void
  label?: string | React.ReactNode
  description?: string | React.ReactNode
  children: React.ReactNode
  isShowCloseButton?: boolean
  closeOnBackdrop?: boolean
  classNameBackdrop?: string
  classNamePanel?: string
  classNameLabel?: string
}

export function ModalContainer({
  isOpen,
  onClose,
  label,
  description,
  children,
  isShowCloseButton = true,
  closeOnBackdrop = true,
  classNameBackdrop,
  classNamePanel,
  classNameLabel,
}: ModalContainerProps) {
  // Tracks whether the current mouse gesture started on the backdrop (vs. inside the panel).
  const mouseDownOnBackdropRef = useRef(false)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleKeyDown])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={twMerge(
            "fixed inset-0 z-50 flex items-center justify-center bg-dark-base/90 p-4 backdrop-blur-sm",
            classNameBackdrop,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={e => {
            mouseDownOnBackdropRef.current = e.target === e.currentTarget
          }}
          onMouseUp={e => {
            if (closeOnBackdrop && mouseDownOnBackdropRef.current && e.target === e.currentTarget) onClose()
            mouseDownOnBackdropRef.current = false
          }}>
          <motion.div
            className={twMerge(
              "relative flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-lg border border-white/10 bg-surface p-6 shadow-2xl focus:outline-none",
              classNamePanel,
            )}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2 }}>
            {isShowCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:text-white focus:outline-none">
                <IoMdClose size={18} />
              </button>
            )}
            {label && (
              <h2 className={twMerge("mb-1 text-center text-xl font-bold text-white", classNameLabel)}>{label}</h2>
            )}
            {description && <p className="mb-5 text-center text-sm text-neutral-400">{description}</p>}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
