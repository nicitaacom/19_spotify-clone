"use client"

import Link from "next/link"
import { twMerge } from "tailwind-merge"

import useLoadImage from "@/hooks/useLoadImage"
import { PlaylistOption, Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import CoverImage from "@/components/CoverImage"
import LockedArtwork from "@/components/LockedArtwork"
import useOnPlay from "@/hooks/useOnPlay"

interface MediaItemProps {
  data: Song
  onClick?: (id: string) => void
  size?: number
  titleClassName?: string
  playlists?: Pick<PlaylistOption, "id" | "slug" | "title">[]
  onPlaylistClick?: () => void
}

const MediaItem: React.FC<MediaItemProps> = ({ data, onClick, size = 48, titleClassName, playlists = [], onPlaylistClick }) => {
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
      <div className="flex min-w-0 flex-col gap-y-1 overflow-hidden">
        <p className={twMerge("truncate text-white", player.activeId === data.id && "text-neon", lockedPaid && "blur-sm", titleClassName)}>{data.title}</p>
        <div className="flex w-full min-w-0 items-center gap-x-2 text-sm">
          <p className="min-w-0 shrink truncate text-neutral-400">
            {lockedPaid ? "Paid track" : `${data.author}${data.access_unavailable ? " · Unavailable" : data.can_play === false ? " · Locked" : ""}`}
          </p>
          {playlists.map(playlist => (
            <Link
              key={playlist.id}
              href={`/playlists/${playlist.slug}`}
              title={playlist.title}
              onClick={event => {
                event.stopPropagation()
                onPlaylistClick?.()
              }}
              className="max-w-64 shrink-0 truncate text-neon hover:underline">
              {playlist.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MediaItem
