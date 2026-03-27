"use client"

import { useEffect, useRef } from "react"

import { Song } from "@/types"

import useLoadSongUrl from "./useLoadSongUrl"
import usePlayer from "./usePlayer"

interface PlaybackSoundLike {
  duration: () => number
  seek: () => number | number[]
}

interface UsePreloadNextTrackParams {
  currentSong: Song
  isPlaying: boolean
  sound: PlaybackSoundLike | null
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

  const preloadAudioRef = useRef<HTMLAudioElement | null>(null)
  const preloadTargetIdRef = useRef<string | undefined>(undefined)

  const currentIndex = ids.findIndex(id => id === activeId)
  const nextSongId = currentIndex >= 0 ? ids[currentIndex + 1] : undefined
  const nextSong = nextSongId ? songs.find(song => song.id === nextSongId) : undefined
  const nextSongUrl = useLoadSongUrl(nextSong)

  const unloadPreloadedTrack = () => {
    const preloadedAudio = preloadAudioRef.current

    if (preloadedAudio) {
      preloadedAudio.pause()
      preloadedAudio.removeAttribute("src")
      preloadedAudio.load()
    }

    preloadAudioRef.current = null
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

    if (preloadTargetIdRef.current && preloadTargetIdRef.current !== nextSongId) {
      unloadPreloadedTrack()
    }

    if (preloadedSongId && preloadedSongId !== nextSongId) {
      setPreloadedSongId(undefined)
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

    if (preloadTargetIdRef.current === nextSongId && preloadAudioRef.current) {
      return
    }

    unloadPreloadedTrack()

    const preloadedAudio = new Audio()
    preloadedAudio.preload = "auto"
    preloadedAudio.src = nextSongUrl
    preloadedAudio.load()

    preloadAudioRef.current = preloadedAudio
    preloadTargetIdRef.current = nextSongId
  }, [nextSongId, nextSongUrl, preloadedSongId])

  useEffect(
    () => () => {
      unloadPreloadedTrack()
    },
    [],
  )
}

export default usePreloadNextTrack
