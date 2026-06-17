"use client"

import Image from "next/image"
import { KeyboardEvent } from "react"
import { AiOutlineLoading3Quarters } from "react-icons/ai"
import { twMerge } from "tailwind-merge"

import useLoadImage from "@/hooks/useLoadImage"
import { Song } from "@/types"

import AddToPlaylistButton from "./AddToPlaylistButton"
import LikeButton from "./LikeButton"
import PlayButton from "./PlayButton"

interface SongItemProps {
  data: Song
  onPlay?: (id: string) => void
  onAddToPlaylist?: (song: Song) => void
  onLike?: (songId: string, isLiked: boolean) => void
  isLoading?: boolean
  isPlaying?: boolean
  className?: string
  priority?: boolean
}

const SongItem: React.FC<SongItemProps> = ({ data, onPlay, onAddToPlaylist, onLike, isLoading = false, isPlaying = false, className, priority = false }) => {
  const imagePath = useLoadImage(data)
  const handlePlay = () => onPlay?.(data.id)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handlePlay()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handlePlay}
      onKeyDown={handleKeyDown}
      className={twMerge(
        `group relative flex flex-col overflow-hidden rounded-xl border border-white/5 bg-surface
        shadow-[0_4px_12px_rgba(0,0,0,0.5)]
        transition duration-200 hover:border-white/10 hover:bg-elevated
        focus:outline-none focus-visible:ring-1 focus-visible:ring-neon/40`,
        className,
      )}>

      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Image
          className="object-cover transition duration-300 group-hover:scale-105"
          src={imagePath || "/images/liked.png"}
          fill
          sizes="(min-width: 1280px) 14vw, (min-width: 1024px) 20vw, (min-width: 640px) 25vw, 50vw"
          alt={data.title}
          priority={priority}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-transparent" />

        {/* Top-left SONG badge */}
        <div className="absolute left-2 top-2">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-neutral-300 backdrop-blur-sm">
            Song
          </span>
        </div>

        {/* Top-right action buttons */}
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <span onClick={e => e.stopPropagation()}>
            <LikeButton
              songId={data.id}
              size={14}
              onToggle={isLiked => onLike?.(data.id, isLiked)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition hover:text-red-400"
            />
          </span>
          <span onClick={e => e.stopPropagation()}>
            <AddToPlaylistButton
              song={data}
              onClick={onAddToPlaylist}
              size={14}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-neutral-200 backdrop-blur-sm transition hover:text-white"
            />
          </span>
        </div>

        {/* Centered play button */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-200 group-hover:opacity-100">
          {isLoading ? (
            <div className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-neon text-black">
              <AiOutlineLoading3Quarters size={20} className="animate-spin" />
            </div>
          ) : (
            <PlayButton
              onClick={handlePlay}
              isPlaying={isPlaying}
              size={isPlaying ? 28 : 18}
              className="pointer-events-auto h-12 w-12 p-0"
            />
          )}
        </div>
      </div>

      {/* Info */}
      <div className="px-2 py-1.5">
        <p className={twMerge("truncate text-[11px] font-semibold text-white", isPlaying && "text-neon")}>{data.title}</p>
        <p className="truncate text-[10px] text-neutral-500">{data.author}</p>
      </div>
    </div>
  )
}

export default SongItem
