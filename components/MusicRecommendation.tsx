"use client"

import { useState } from "react"
import { FiPause, FiPlay } from "react-icons/fi"
import { twMerge } from "tailwind-merge"

type MusicRecommendationProps = {
  className?: string
  track: string
  isPlaying?: boolean
  onTogglePlay?: () => void
  onNeverShowAgainChange?: (isChecked: boolean) => void
}

export default function MusicRecommendation({
  className,
  track,
  isPlaying = false,
  onTogglePlay,
  onNeverShowAgainChange,
}: MusicRecommendationProps) {
  const [isNeverShowAgain, setIsNeverShowAgain] = useState(false)
  const PlayIcon = isPlaying ? FiPause : FiPlay

  const handleNeverShowAgainChange = (isChecked: boolean) => {
    setIsNeverShowAgain(isChecked)
    onNeverShowAgainChange?.(isChecked)
  }

  return (
    <div className={twMerge("flex w-fit items-center gap-3 rounded-full border-2 border-white bg-black py-2 pl-2 pr-5 text-white", className)}>
      <button
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-neutral-300"
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={onTogglePlay}>
        <PlayIcon className={twMerge("h-4 w-4 fill-current", !isPlaying && "ml-0.5")} />
      </button>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium leading-tight">{track}</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs leading-tight text-neutral-300">
          <input
            className="h-3.5 w-3.5 cursor-pointer accent-white"
            type="checkbox"
            checked={isNeverShowAgain}
            onChange={event => handleNeverShowAgainChange(event.target.checked)}
          />
          Never show again
        </label>
      </div>
    </div>
  )
}
