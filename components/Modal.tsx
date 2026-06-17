import * as Dialog from "@radix-ui/react-dialog"
import { twMerge } from "tailwind-merge"
import { IoMdClose } from "react-icons/io"

interface ModalProps {
  isOpen: boolean
  onChange: (open: boolean) => void
  title: string
  description: string
  children: React.ReactNode
  contentClassName?: string
  descriptionClassName?: string
  overlayClassName?: string
  titleClassName?: string
  hideHeader?: boolean
  isShowCloseButton?: boolean
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onChange,
  title,
  description,
  children,
  contentClassName,
  descriptionClassName,
  overlayClassName,
  titleClassName,
  hideHeader = false,
  isShowCloseButton = true,
}) => {
  return (
    <Dialog.Root open={isOpen} defaultOpen={isOpen} onOpenChange={onChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={twMerge(
            `
            bg-dark-base/90
            backdrop-blur-sm
            fixed
            inset-0
            z-50
          `,
            overlayClassName,
          )}
        />
        <Dialog.Content
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
            translate-x-[-50%]
            translate-y-[-50%]
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
          <div className="h-full">{children}</div>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default Modal
