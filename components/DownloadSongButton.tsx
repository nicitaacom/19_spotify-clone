"use client"

import { FiDownload, FiLoader } from "react-icons/fi"
import type { Song } from "@/types"
import useSongDownload from "@/hooks/useSongDownload"

export default function DownloadSongButton({ song, playlistTitle }: { song: Song; playlistTitle: string }) {
  const { handleDownload, isDownloading, progress, disabled } = useSongDownload(song, playlistTitle)
  const label = isDownloading ? `Preparing ${song.title}: ${progress}%`
    : song.access_unavailable ? `Download unavailable for ${song.title}`
    : disabled ? `Unlock ${song.title} to download`
    : `Download ${song.title} as MP3`

  return (
    <button type="button" onClick={handleDownload} disabled={disabled || isDownloading}
      aria-label={label} title={label} aria-busy={isDownloading}
      className="shrink-0 rounded p-1 text-neutral-400 transition hover:text-neon focus-visible:outline-neon disabled:cursor-not-allowed disabled:opacity-40">
      {isDownloading ? <FiLoader size={17} className="animate-spin" /> : <FiDownload size={17} />}
    </button>
  )
}
