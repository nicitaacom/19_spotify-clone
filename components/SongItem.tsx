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
}

const SongItem: React.FC<SongItemProps> = ({ data, onPlay, onAddToPlaylist, onLike, isLoading = false, isPlaying = false, className }) => {
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
        `
        group
        relative
        flex
        h-full
        flex-col
        overflow-hidden
        rounded-2xl
        border
        border-white/20
        bg-neutral-900
        text-left
        shadow-xl
        transition
        duration-300
        hover:border-emerald-500/20
        hover:shadow-[0_20px_60px_-20px_rgba(16,185,129,0.25)]
        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-emerald-400/40
      `,
        className,
      )}>
      {/* 1. Image block — 4:3 ratio for wider feel */}
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Image
          className="object-cover transition duration-700 group-hover:scale-105"
          src={imagePath || "/images/liked.png"}
          fill
          sizes="(min-width: 1536px) 12.5vw, (min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          alt={data.title}
        />

        {/* 2. Gradient overlay — heavier at bottom for text contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-transparent" />

        {/* 3. Top-left SONG badge */}
        <div className="absolute left-3 top-3">
          <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 backdrop-blur-md">
            Song
          </span>
        </div>

        {/* 4. Top-right action buttons — each wrapped to kill bubbling */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <span onClick={event => event.stopPropagation()}>
            <LikeButton
              songId={data.id}
              size={16}
              onToggle={isLiked => onLike?.(data.id, isLiked)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 backdrop-blur-md transition hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-400"
            />
          </span>
          <span onClick={event => event.stopPropagation()}>
            <AddToPlaylistButton
              song={data}
              onClick={onAddToPlaylist}
              size={16}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-neutral-100 backdrop-blur-md transition hover:border-white/20 hover:bg-white/40"
            />
          </span>
        </div>

        {/* 5. Centered play button — pointer-events-none on overlay so buttons underneath stay clickable */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
          {isLoading ? (
            <div className="pointer-events-auto flex h-14 w-14 scale-100 items-center justify-center rounded-full border border-black/10 bg-white text-black shadow-2xl">
              <AiOutlineLoading3Quarters size={22} className="animate-spin" />
            </div>
          ) : (
            <PlayButton
              onClick={handlePlay}
              isPlaying={isPlaying}
              className="pointer-events-auto h-14 w-14 scale-90 border border-black/10 p-0 shadow-2xl transition duration-300 group-hover:scale-100"
            />
          )}
        </div>
      </div>

      {/* 6. Info row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-white">{data.title}</p>
          <p className="mt-0.5 truncate text-xs text-neutral-500">By {data.author}</p>
        </div>
      </div>
    </div>
  )
}

export default SongItem
