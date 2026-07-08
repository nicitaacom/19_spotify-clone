"use client"

import { useState, useRef } from "react"
import { BeatLoader } from "react-spinners"
import { twMerge } from "tailwind-merge"

import useOnEscOrClickOutside from "@/hooks/useOnEscOrClickOutside"

interface DownloadSplitButtonProps {
  onDownload: (format: "mp3" | "wav") => void
  isRendering: boolean
  disabled?: boolean
}

const DownloadSplitButton = ({ onDownload, isRendering, disabled }: DownloadSplitButtonProps) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useOnEscOrClickOutside(ref, () => setOpen(false), open)

  const handleMain = () => {
    if (isRendering || disabled) return
    onDownload("mp3")
  }

  const handleOption = (format: "mp3" | "wav") => {
    setOpen(false)
    if (isRendering || disabled) return
    onDownload(format)
  }

  const basePill = "px-5 py-2.5 text-sm font-bold transition flex items-center justify-center"
  const mainClasses = twMerge(
    "bg-neon text-black hover:bg-neon-strong rounded-l-full",
    (isRendering || disabled) && "opacity-60 cursor-not-allowed",
  )
  const caretClasses = twMerge(
    "bg-neon/90 text-black border-l border-black/20 rounded-r-full px-3 hover:bg-neon-strong",
    (isRendering || disabled) && "opacity-60 cursor-not-allowed",
  )

  return (
    <div className="inline-flex relative" ref={ref}>
      <button
        onClick={handleMain}
        disabled={isRendering || disabled}
        className={twMerge(basePill, mainClasses)}>
        {isRendering ? <BeatLoader size={8} color="#000" /> : "Download"}
      </button>

      <button
        onClick={() => !isRendering && !disabled && setOpen((o) => !o)}
        disabled={isRendering || disabled}
        className={twMerge(basePill, caretClasses)}
        aria-label="Download options">
        ▾
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-md border border-white/10 bg-elevated py-1 text-sm shadow-lg">
          <button
            onClick={() => handleOption("mp3")}
            className="w-full text-left px-4 py-1.5 hover:bg-white/5 text-neutral-300 hover:text-white">
            MP3 (192 kbps)
          </button>
          <button
            onClick={() => handleOption("wav")}
            className="w-full text-left px-4 py-1.5 hover:bg-white/5 text-neutral-300 hover:text-white">
            WAV (lossless)
          </button>
        </div>
      )}
    </div>
  )
}

export default DownloadSplitButton
