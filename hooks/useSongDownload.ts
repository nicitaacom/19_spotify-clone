"use client"

import { useRef, useState } from "react"
import toast from "react-hot-toast"
import type { Song } from "@/types"

export default function useSongDownload(song: Song, playlistTitle: string) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState(0)
  const downloadingRef = useRef(false)
  const disabled = song.can_play !== true || Boolean(song.access_unavailable)

  const handleDownload = async () => {
    if (disabled || downloadingRef.current) return
    downloadingRef.current = true
    setIsDownloading(true)
    setProgress(0)
    try {
      const { downloadSong } = await import("@/libs/songDownload")
      await downloadSong(song, playlistTitle, setProgress)
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      const cause = error instanceof Error && error.cause
        ? ` (${error.cause instanceof Error ? `${error.cause.name}: ${error.cause.message}` : String(error.cause)})`
        : ""
      toast.error(`Download failed for ${song.title}: ${message}${cause}`)
    } finally {
      downloadingRef.current = false
      setIsDownloading(false)
      setProgress(0)
    }
  }

  return { handleDownload, isDownloading, progress, disabled }
}
