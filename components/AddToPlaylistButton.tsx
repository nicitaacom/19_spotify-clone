"use client"

import { MouseEvent } from "react"
import { TbPlaylistAdd } from "react-icons/tb"

import { Song } from "@/types"
import { useUser } from "@/hooks/useUser"
import useAddToPlaylistModal from "@/hooks/useAddToPlaylistModal"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import { handleAuthAction } from "@/app/utils/handleAuthAction"

interface AddToPlaylistButtonProps {
  song: Song
  className?: string
  iconClassName?: string
  size?: number
}

const AddToPlaylistButton: React.FC<AddToPlaylistButtonProps> = ({ song, className, iconClassName, size = 22 }) => {
  const { user } = useUser()
  const isIframe = useIsIframeAuth()
  const addToPlaylistModal = useAddToPlaylistModal()

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (!user) {
      return handleAuthAction({ isIframe })
    }

    addToPlaylistModal.onOpen(song)
  }

  return (
    <button
      type="button"
      aria-label={`Add ${song.title} to playlist`}
      className={className ?? "cursor-pointer text-neutral-300 transition hover:text-white hover:opacity-75"}
      onClick={handleClick}>
      <TbPlaylistAdd className={iconClassName} size={size} />
    </button>
  )
}

export default AddToPlaylistButton
