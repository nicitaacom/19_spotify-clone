"use client"

import { useRef, useState } from "react"
import toast from "react-hot-toast"
import type { Song } from "@/types"
import { errorText } from "@/libs/errorText"

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
      toast.error(`Download failed for ${song.title}: ${errorText(error)}`)
    } finally {
      downloadingRef.current = false
      setIsDownloading(false)
      setProgress(0)
    }
  }

  return { handleDownload, isDownloading, progress, disabled }
}
