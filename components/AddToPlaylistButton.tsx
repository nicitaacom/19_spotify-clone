"use client"

import { MouseEvent } from "react"
import { TbPlaylistAdd } from "react-icons/tb"

import { Song } from "@/types"
import { useUser } from "@/hooks/useUser"
import useAddToPlaylistModal from "@/hooks/useAddToPlaylistModal"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import { handleAuthAction } from "@/app/utils/handleAuthAction"
import { twMerge } from "tailwind-merge"

interface AddToPlaylistButtonProps {
  song: Song
  className?: string
  iconClassName?: string
  size?: number
  onClick?: (song: Song) => void
}

const AddToPlaylistButton: React.FC<AddToPlaylistButtonProps> = ({
  song,
  className,
  iconClassName,
  size = 22,
  onClick,
}) => {
  const { user } = useUser()
  const isIframe = useIsIframeAuth()
  const addToPlaylistModal = useAddToPlaylistModal()

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (!user) {
      return handleAuthAction({ isIframe })
    }

    addToPlaylistModal.onOpen(song)
    onClick?.(song)
  }

  return (
    <button
      type="button"
      aria-label={`Add ${song.title} to playlist`}
      className={className ?? "cursor-pointer text-neutral-300 transition hover:text-white hover:opacity-75"}
      onClick={handleClick}>
      <TbPlaylistAdd className={twMerge("text-inherit", iconClassName)} size={size} />
    </button>
  )
}

export default AddToPlaylistButton
