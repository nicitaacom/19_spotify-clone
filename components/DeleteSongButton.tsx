"use client"

import { MouseEvent } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { FiTrash2 } from "react-icons/fi"
import { twMerge } from "tailwind-merge"

import { Song } from "@/types"
import { readHttpError } from "@/libs/errorText"
import { useAreYouSureModals } from "@/store/modals/useAreYouSureModals"
import useDeletedSongs from "@/hooks/useDeletedSongs"

interface DeleteSongButtonProps {
  song: Song
  className?: string
  iconClassName?: string
  size?: number
  disabled?: boolean
  onDeleted?: (songId: string) => void
}

const DeleteSongButton: React.FC<DeleteSongButtonProps> = ({ song, className, iconClassName, size = 15, disabled = false, onDeleted }) => {
  const router = useRouter()
  const { openModal } = useAreYouSureModals()

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    const confirmed = await openModal("areYouSureDeleteSong", { title: song.title })
    if (!confirmed) return

    const response = await fetch(`/api/songs/${song.id}/delete`, { method: "DELETE" })

    if (!response.ok) {
      toast.error(await readHttpError(response, `Delete song ${song.id}`))
      return
    }

    useDeletedSongs.getState().markDeleted(String(song.id))
    toast.success(`"${song.title}" deleted.`)
    onDeleted?.(song.id)
    router.refresh()
  }

  return (
    <button
      type="button"
      aria-label={`Delete ${song.title}`}
      title="Delete song permanently"
      disabled={disabled}
      className={twMerge("cursor-pointer transition hover:text-red-400", className)}
      onClick={handleDelete}>
      <FiTrash2 className={iconClassName} size={size} />
    </button>
  )
}

export default DeleteSongButton
