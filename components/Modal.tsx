"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { AnimatePresence, motion } from "framer-motion"
import { twMerge } from "tailwind-merge"
import { IoMdClose } from "react-icons/io"

interface ModalProps {
  isOpen: boolean
  onChange: (open: boolean) => void
  title: string
  description: string
  children: React.ReactNode
  contentClassName?: string
  bodyClassName?: string
  descriptionClassName?: string
  titleAside?: React.ReactNode
  overlayClassName?: string
  titleClassName?: string
  hideHeader?: boolean
  isShowCloseButton?: boolean
  onEscapeKeyDown?: React.ComponentProps<typeof Dialog.Content>["onEscapeKeyDown"]
  onOpenAutoFocus?: React.ComponentProps<typeof Dialog.Content>["onOpenAutoFocus"]
  onExitComplete?: () => void
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onChange,
  title,
  description,
  children,
  contentClassName,
  bodyClassName,
  descriptionClassName,
  titleAside,
  overlayClassName,
  titleClassName,
  hideHeader = false,
  isShowCloseButton = true,
  onEscapeKeyDown,
  onOpenAutoFocus,
  onExitComplete,
}) => {
  const titleElement = (
    <Dialog.Title
      className={twMerge(
        hideHeader
          ? "sr-only"
          : `
              text-xl
              text-center
              font-bold
              mb-4
            `,
        titleClassName,
      )}>
      {title}
    </Dialog.Title>
  )

  return (
    <Dialog.Root open={isOpen} onOpenChange={onChange}>
      <AnimatePresence onExitComplete={onExitComplete}>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={twMerge("fixed inset-0 z-50 bg-dark-base/90 backdrop-blur-sm", overlayClassName)}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onOpenAutoFocus={onOpenAutoFocus}
              onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={event => {
            const target = event.target
            if (target instanceof Element && target.closest(".app-toast-viewport")) event.preventDefault()
          }}
        >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={twMerge(
            `
            fixed
            drop-shadow-md
            top-[50%]
            left-[50%]
            max-h-full
            h-full
            md:h-auto
            md:max-h-[85vh]
            w-full
            md:w-[90vw]
            md:max-w-[450px]
            rounded-md
            bg-surface
            border
            border-white/10
            p-[25px]
            focus:outline-none
            z-50
          `,
            contentClassName,
          )}>
          {titleAside ? (
            <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 pr-8">
              {titleElement}
              <div className="flex min-h-10 min-w-0 items-center">{titleAside}</div>
            </div>
          ) : (
            titleElement
          )}
          {description ? (
            <Dialog.Description
              className={twMerge(
                hideHeader
                  ? "sr-only"
                  : `
              mb-5 
              text-sm 
              leading-normal 
              text-center
            `,
                descriptionClassName,
              )}>
              {description}
            </Dialog.Description>
          ) : null}
          <div className={twMerge("h-full", bodyClassName)}>{children}</div>
          {isShowCloseButton && (
            <Dialog.Close asChild>
              <button
                className="
                  text-neutral-400
                  hover:text-white
                  absolute
                  top-[10px]
                  right-[10px]
                  inline-flex
                  h-[25px]
                  w-[25px]
                  appearance-none
                  items-center
                  justify-center
                  rounded-full
                  focus:outline-none
                "
                aria-label="Close">
                <IoMdClose />
              </button>
            </Dialog.Close>
          )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

export default Modal
