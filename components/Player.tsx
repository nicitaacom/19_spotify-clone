"use client"

import { useCallback, useEffect } from "react"
import { AiOutlineLoading3Quarters } from "react-icons/ai"

import usePlayer from "@/hooks/usePlayer"
import useLoadSongUrl from "@/hooks/useLoadSongUrl"
import useGetSongById from "@/hooks/useGetSongById"
import { useExclusivePlaybackSource } from "@/app/providers/PlaybackSyncProvider"

import PlayerContent from "./PlayerContent"

const Player = () => {
  const {
    activeId,
    activeSong: currentStoreSong,
    isPlaying,
    setActiveSong,
    progress,
    requestSeek,
    requestPlaybackCommand,
    togglePlayback,
    stopPlayback,
  } = usePlayer()

  const pauseForExternalPlayback = useCallback(() => {
    if (usePlayer.getState().isPlaying) requestPlaybackCommand("pause")
  }, [requestPlaybackCommand])

  useExclusivePlaybackSource({
    isPlaying,
    onStop: pauseForExternalPlayback,
  })

  const activeSong = currentStoreSong?.id === activeId ? currentStoreSong : undefined
  const { song: fetchedSong } = useGetSongById(activeSong ? undefined : activeId)
  const song = activeSong ?? fetchedSong

  useEffect(() => {
    if (fetchedSong && fetchedSong.id === activeId) {
      setActiveSong(fetchedSong)
    }
  }, [activeId, fetchedSong, setActiveSong])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
      }

      if (e.code === "F8") {
        e.preventDefault()
        stopPlayback()
        return
      }

      if (e.code === "Space") {
        e.preventDefault()
        togglePlayback()
        return
      }

      if (e.code === "Escape") {
        e.preventDefault()
        requestSeek(0)
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [requestSeek, togglePlayback, stopPlayback])

  const songUrl = useLoadSongUrl(song)

  if (!activeId) {
    return null
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    const nextProgress = Math.max(0, Math.min(1, x / width))
    requestSeek(nextProgress)
  }

  return (
    <div
      className="
        fixed
        bottom-0
        bg-surface
        border-t
        border-white/5
        w-full
        h-[80px]
        z-10
      ">
      {/* Full-width Progress Bar */}
      <div
        onClick={handleSeek}
        className="
          absolute 
          top-0 
          left-0 
          w-full 
          h-[3px] 
          bg-elevated
          cursor-pointer 
          group/progress
        ">
        <div
          style={{ width: `${progress * 100}%` }}
          className="relative h-full bg-neon shadow-neon-sm transition-all duration-300">
          <div
            className="
              absolute
              right-0
              top-1/2
              -translate-y-1/2
              translate-x-1/2
              h-4
              w-4
              rounded-full
              bg-neon
              shadow-neon-sm
              border-2
              border-white
              transition-transform
              hover:scale-110
            "
          />
        </div>
      </div>

      <div className="flex h-full items-center px-4 py-2">
        {song && songUrl ? (
          <PlayerContent key={`${song.id}-${songUrl}`} song={song} songUrl={songUrl} />
        ) : (
          <div className="flex h-full items-center gap-x-4 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-elevated">
              <AiOutlineLoading3Quarters className="animate-spin text-neutral-300" size={22} />
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-medium">Preparing your track...</p>
              <p className="text-xs text-neutral-400">Loading audio for playback.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Player
