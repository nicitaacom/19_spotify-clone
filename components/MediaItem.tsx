"use client"

import { twMerge } from "tailwind-merge"

import useLoadImage from "@/hooks/useLoadImage"
import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import CoverImage from "@/components/CoverImage"

interface MediaItemProps {
  data: Song
  onClick?: (id: string) => void
  size?: number
}

const MediaItem: React.FC<MediaItemProps> = ({ data, onClick, size = 48 }) => {
  const player = usePlayer()
  const imageUrl = useLoadImage(data)

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

    player.setIsPlaying(false)
    player.setActiveSong(data)
    player.setIsLoading(true)
    return player.setId(data.id)
  }

  return (
    <div
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
      ">
      <div style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-md">
        <CoverImage
          fill
          sizes={`${size * 2}px`}
          src={imageUrl}
          alt="MediaItem"
          className="object-cover"
          loading="eager"
        />
      </div>
      <div className="flex flex-col gap-y-1 overflow-hidden">
        <p className={twMerge(`text-white truncate`, player.activeId === data.id && "text-neon")}>{data.title}</p>
        <p className="text-neutral-400 text-sm truncate">By {data.author}</p>
      </div>
    </div>
  )
}

export default MediaItem
