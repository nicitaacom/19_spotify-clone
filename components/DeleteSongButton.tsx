"use client"

import { MouseEvent } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { FiTrash2 } from "react-icons/fi"
import { twMerge } from "tailwind-merge"

import { Song } from "@/types"

interface DeleteSongButtonProps {
  song: Song
  className?: string
  iconClassName?: string
  size?: number
  onDeleted?: (songId: string) => void
}

const DeleteSongButton: React.FC<DeleteSongButtonProps> = ({ song, className, iconClassName, size = 15, onDeleted }) => {
  const router = useRouter()

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return

    const response = await fetch(`/api/songs/${song.id}/delete`, { method: "DELETE" })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      toast.error(body.error ?? "Failed to delete song.")
      return
    }

    toast.success(`"${song.title}" deleted.`)
    onDeleted?.(song.id)
    router.refresh()
  }

  return (
    <button
      type="button"
      aria-label={`Delete ${song.title}`}
      className={twMerge("cursor-pointer transition hover:text-red-400", className)}
      onClick={handleDelete}>
      <FiTrash2 className={iconClassName} size={size} />
    </button>
  )
}

export default DeleteSongButton
