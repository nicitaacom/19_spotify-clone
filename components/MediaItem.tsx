"use client"

import Image from "next/image"
import { twMerge } from "tailwind-merge"

import useLoadImage from "@/hooks/useLoadImage"
import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"

interface MediaItemProps {
  data: Song
  onClick?: (id: string) => void
}

const MediaItem: React.FC<MediaItemProps> = ({ data, onClick }) => {
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
        hover:bg-neutral-800/50 
        w-full 
        p-2 
        rounded-md
        overflow-hidden
      ">
      <div
        className="
          relative 
          rounded-md 
          min-h-[48px] 
          min-w-[48px] 
          overflow-hidden
        ">
        <Image fill sizes="48px" src={imageUrl || "/images/liked.png"} alt="MediaItem" className="object-cover" loading="eager" />
      </div>
      <div className="flex flex-col gap-y-1 overflow-hidden">
        <p className={twMerge(`text-white truncate`, player.activeId === data.id && "text-emerald-500")}>
          {data.title}
        </p>
        <p className="text-neutral-400 text-sm truncate">By {data.author}</p>
      </div>
    </div>
  )
}

export default MediaItem
