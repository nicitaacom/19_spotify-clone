"use client"

import { twMerge } from "tailwind-merge"

import useLoadImage from "@/hooks/useLoadImage"
import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import CoverImage from "@/components/CoverImage"
import LockedArtwork from "@/components/LockedArtwork"
import useOnPlay from "@/hooks/useOnPlay"

interface MediaItemProps {
  data: Song
  onClick?: (id: string) => void
  size?: number
  titleClassName?: string
}

const MediaItem: React.FC<MediaItemProps> = ({ data, onClick, size = 48, titleClassName }) => {
  const player = usePlayer()
  const imageUrl = useLoadImage(data)
  const lockedPaid = data.is_paid === true && data.can_play === false
  const playSong = useOnPlay([data])

  const handleClick = () => {
    if (onClick) {
      return onClick(data.id)
    }

    if (player.activeId === data.id) {
      if (!player.activeSong) {
        player.setActiveSong(data)
      }

      if (!player.isLoading) {
        player.requestPlaybackCommand(player.isPlaying ? "pause" : "play")
      }

      return
    }

    return playSong(data.id)
  }

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={`${data.access_unavailable ? "Unavailable" : data.can_play === false ? "Unlock" : "Play"} ${lockedPaid ? "paid track" : data.title}`}
      onClick={handleClick}
      className="
        relative
        flex 
        items-center 
        gap-x-3 
        cursor-pointer 
        hover:bg-elevated/80
        w-full 
        p-2 
        rounded-md
        overflow-hidden
        outline-none
      ">
      <div style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-md">
        {lockedPaid ? (
          <LockedArtwork className="absolute inset-0 text-xl" />
        ) : (
          <CoverImage
            fill
            sizes={`${size * 2}px`}
            src={imageUrl}
            alt="MediaItem"
            className="object-cover"
            loading="eager"
          />
        )}
      </div>
      <div className="flex flex-col gap-y-1 overflow-hidden">
        <p className={twMerge("truncate text-white", player.activeId === data.id && "text-neon", lockedPaid && "blur-sm", titleClassName)}>{data.title}</p>
        <p className="text-neutral-400 text-sm truncate">
          {lockedPaid ? "Paid track" : `${data.author}${data.access_unavailable ? " · Unavailable" : data.can_play === false ? " · Locked" : ""}`}
        </p>
      </div>
    </div>
  )
}

export default MediaItem
