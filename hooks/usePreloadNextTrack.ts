"use client"

import { useEffect, useRef } from "react"
import type { Howl } from "howler"

import { Song } from "@/types"

import useLoadSongUrl from "./useLoadSongUrl"
import usePlayer from "./usePlayer"

interface UsePreloadNextTrackParams {
  currentSong: Song
  isPlaying: boolean
  sound: Howl | null
}

const PRELOAD_THRESHOLD = 0.8
const PROGRESS_POLL_INTERVAL_MS = 400

const usePreloadNextTrack = ({ currentSong, isPlaying, sound }: UsePreloadNextTrackParams) => {
  const ids = usePlayer(state => state.ids)
  const songs = usePlayer(state => state.songs)
  const activeId = usePlayer(state => state.activeId)
  const preloadedSongId = usePlayer(state => state.preloadedSongId)
  const setPreloadedSongId = usePlayer(state => state.setPreloadedSongId)
  const setProgress = usePlayer(state => state.setProgress)

  const preloadHowlRef = useRef<Howl | null>(null)
  const preloadTargetIdRef = useRef<string | undefined>(undefined)

  const currentIndex = ids.findIndex(id => id === activeId)
  const nextSongId = currentIndex >= 0 ? ids[currentIndex + 1] : undefined
  const nextSong = nextSongId ? songs.find(song => song.id === nextSongId) : undefined
  const nextSongUrl = useLoadSongUrl(nextSong)

  const unloadPreloadedTrack = () => {
    preloadHowlRef.current?.unload()
    preloadHowlRef.current = null
    preloadTargetIdRef.current = undefined
  }

  useEffect(() => {
    setProgress(0)
    setPreloadedSongId(undefined)
  }, [currentSong.id, setPreloadedSongId, setProgress])

  useEffect(() => {
    if (!nextSongId) {
      setPreloadedSongId(undefined)
      unloadPreloadedTrack()
      return
    }

    if (preloadedSongId && preloadedSongId !== nextSongId) {
      setPreloadedSongId(undefined)
      unloadPreloadedTrack()
    }
  }, [nextSongId, preloadedSongId, setPreloadedSongId])

  useEffect(() => {
    if (!isPlaying || !sound) {
      return
    }

    const syncProgress = () => {
      const duration = sound.duration()
      const seek = sound.seek()
      const safeSeek = typeof seek === "number" ? seek : 0

      if (!duration) {
        return
      }

      const nextProgress = Math.max(0, Math.min(1, safeSeek / duration))
      setProgress(nextProgress)

      if (nextProgress >= PRELOAD_THRESHOLD && nextSongId && preloadedSongId !== nextSongId) {
        setPreloadedSongId(nextSongId)
      }
    }

    syncProgress()

    const intervalId = window.setInterval(syncProgress, PROGRESS_POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isPlaying, nextSongId, preloadedSongId, setPreloadedSongId, setProgress, sound])

  useEffect(() => {
    if (!nextSongId || !nextSongUrl || preloadedSongId !== nextSongId) {
      return
    }

    if (preloadTargetIdRef.current === nextSongId && preloadHowlRef.current) {
      return
    }

    let isCancelled = false

    import("howler").then(({ Howl: ImportedHowl }) => {
      if (isCancelled) {
        return
      }

      unloadPreloadedTrack()

      preloadHowlRef.current = new ImportedHowl({
        src: [nextSongUrl],
        preload: true,
        mute: true,
        volume: 0,
        format: ["mp3"],
      })
      preloadTargetIdRef.current = nextSongId
    })

    return () => {
      isCancelled = true
    }
  }, [nextSongId, nextSongUrl, preloadedSongId])

  useEffect(
    () => () => {
      unloadPreloadedTrack()
    },
    [],
  )
}

export default usePreloadNextTrack
