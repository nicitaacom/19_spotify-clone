"use client"

import { useCallback, useEffect, useRef } from "react"
import Link from "next/link"
import { useUser } from "@/hooks/useUser"
import { AiOutlineLoading3Quarters } from "react-icons/ai"

import usePlayer from "@/hooks/usePlayer"
import useSongPlayUrl from "@/hooks/useSongPlayUrl"
import useGetSongById from "@/hooks/useGetSongById"
import { useExclusivePlaybackSource } from "@/app/providers/PlaybackSyncProvider"

import PlayerContent from "./PlayerContent"
import PlayerProgressBar from "./PlayerProgressBar"

const Player = () => {
  const { user, isLoading: isUserLoading } = useUser()
  const resetPlayer = usePlayer(state => state.reset)
  const previousUser = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (isUserLoading) return
    const nextUserId = user?.id ?? null
    if (previousUser.current === undefined) {
      previousUser.current = nextUserId
      return
    }
    if (previousUser.current !== nextUserId) resetPlayer()
    previousUser.current = nextUserId
  }, [isUserLoading, resetPlayer, user?.id])
  const {
    activeId,
    activeSong: currentStoreSong,
    isPlaying,
    setActiveSong,
    requestSeek,
    requestPlaybackCommand,
    togglePlayback,
    stopPlayback,
  } = usePlayer()

  const pauseForExternalPlayback = useCallback(() => {
    const isPlayingNow = usePlayer.getState().isPlaying
    if (isPlayingNow) requestPlaybackCommand("pause")
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

      if ((e.code === "Digit0" || e.code === "Numpad0") && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        requestSeek(0)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [requestSeek, togglePlayback, stopPlayback])

  const { url: songUrl, error: audioError, unlockSlug, expiresAt, retry } = useSongPlayUrl(song)

  if (!activeId) {
    return null
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
      <PlayerProgressBar />

      <div className="flex h-full items-center px-4 py-2">
        {song && songUrl ? (
          <PlayerContent key={`${song.id}-${songUrl}`} song={song} songUrl={songUrl} expiresAt={expiresAt} onRefreshUrl={retry} />
        ) : audioError ? (
          <div className="flex w-full items-center justify-between gap-3 text-sm" role="alert">
            <p className="text-neutral-300">{audioError}</p>
            <div className="flex shrink-0 gap-3">
              {unlockSlug && <Link className="text-neon" href={`/playlists/${unlockSlug}#playlist-access`} prefetch={false}>View playlist</Link>}
              <button className="text-neon" onClick={retry}>Retry</button>
              <button aria-label="Close player" onClick={() => usePlayer.getState().reset()}>Close</button>
            </div>
          </div>
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
