"use client"

import { useState } from "react"
import { FiPause, FiPlay, FiX } from "react-icons/fi"
import { twMerge } from "tailwind-merge"

type MusicRecommendationProps = {
  className?: string
  track: string
  trackHref?: string
  isPlaying?: boolean
  onTogglePlay?: () => void
  onClose?: () => void
  onNeverShowAgainChange?: (isChecked: boolean) => void
}

export default function MusicRecommendation({
  className,
  track,
  trackHref = "",
  isPlaying = false,
  onTogglePlay,
  onClose,
  onNeverShowAgainChange,
}: MusicRecommendationProps) {
  const [isNeverShowAgain, setIsNeverShowAgain] = useState(false)
  const PlayIcon = isPlaying ? FiPause : FiPlay

  const handleNeverShowAgainChange = (isChecked: boolean) => {
    setIsNeverShowAgain(isChecked)
    onNeverShowAgainChange?.(isChecked)
  }

  return (
    <div className={twMerge("relative flex w-full max-w-full items-center gap-3 overflow-visible rounded-full border-2 border-white bg-black py-2 pl-2 pr-5 text-white", className)}>
      <button
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-neutral-300"
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onTogglePlay}>
        <PlayIcon className={twMerge("h-4 w-4 fill-current", !isPlaying && "ml-0.5")} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
        {trackHref ? (
          <a href={trackHref} title={track} target="_blank" rel="noopener noreferrer" className="block w-full min-w-0 truncate text-sm font-medium leading-5 hover:underline">
            {track}
          </a>
        ) : (
          <p title={track} className="block w-full min-w-0 truncate text-sm font-medium leading-5">{track}</p>
        )}
        <label className="flex min-w-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs leading-5 text-neutral-300">
          <input
            className="h-3.5 w-3.5 cursor-pointer accent-white"
            type="checkbox"
            checked={isNeverShowAgain}
            onChange={event => handleNeverShowAgainChange(event.target.checked)}
          />
          Never show again
        </label>
      </div>
      {/* 4. half-bordered ear close button */}
      <button
        className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white border-b-transparent border-l-transparent bg-black text-neutral-400 transition hover:text-white"
        type="button"
        aria-label="Close"
        onClick={onClose}>
        <FiX className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
