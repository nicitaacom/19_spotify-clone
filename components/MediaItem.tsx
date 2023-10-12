"use client"

import Image from "next/image"

import useLoadImage from "@/hooks/useLoadImage"
import { Song } from "@/types"

interface MediaItemProps {
  data: Song
  onClick?: (id: string) => void
}

export default function MediaItem({ data, onClick }: MediaItemProps) {
  const imageUrl = useLoadImage(data)

  const handleClick = () => {
    if (onClick) {
      return onClick(data.id)
    }
    //TODO: Default turn on palyer
  }

  return (
    <div
      className="flex gap-x-3 items-center cursor-pointer hover:bg-neutral-800/50 w-full p-2 rounded-md"
      onClick={handleClick}>
      <div className="relative rounded-md min-h-[48px] min-w-[48px] overflow-hidden">
        <Image className="object-cover" src={imageUrl || "/images/liked.png"} alt="Media Item" fill />
        <div className="flex flex-col gap-y-1 overflow-hidden">
          <p className="text-white truncate">{data.title}</p>
          <p className="text-neutral-400 text-sm truncate">{data.author}</p>
        </div>
      </div>
    </div>
  )
}
