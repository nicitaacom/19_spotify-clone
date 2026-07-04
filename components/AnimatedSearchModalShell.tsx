"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { AnimatePresence, motion } from "framer-motion"
import { twMerge } from "tailwind-merge"
import { IoMdClose } from "react-icons/io"

interface AnimatedSearchModalShellProps {
  isOpen: boolean
  onChange: (open: boolean) => void
  title: string
  description: string
  children: React.ReactNode
  contentClassName?: string
}

const AnimatedSearchModalShell: React.FC<AnimatedSearchModalShellProps> = ({
  isOpen,
  onChange,
  title,
  description,
  children,
  contentClassName,
}) => {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onChange}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                animate={{ opacity: 1 }}
                initial={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-dark-base/90 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount onOpenAutoFocus={event => event.preventDefault()}>
              <motion.div
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={twMerge(
                  "fixed left-[50%] top-[50%] z-50 w-full max-w-[450px] rounded-md border border-white/10 bg-surface p-[25px] focus:outline-none",
                  contentClassName,
                )}>
                <Dialog.Title className="mb-4 text-center text-xl font-bold">{title}</Dialog.Title>
                {description ? <Dialog.Description className="mb-5 text-center text-sm leading-normal">{description}</Dialog.Description> : null}
                <div className="h-full">{children}</div>
                <Dialog.Close asChild>
                  <button
                    className="absolute right-[10px] top-[10px] inline-flex h-[25px] w-[25px] appearance-none items-center justify-center rounded-full text-neutral-400 hover:text-white focus:outline-none"
                    aria-label="Close">
                    <IoMdClose />
                  </button>
                </Dialog.Close>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

export default AnimatedSearchModalShell
