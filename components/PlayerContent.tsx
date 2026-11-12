"use client"

import useSound from "use-sound"
import { useCallback, useEffect, useRef, useState } from "react"
import { BsPauseFill, BsPlayFill, BsSkipStartFill } from "react-icons/bs"
import { HiSpeakerWave, HiSpeakerXMark } from "react-icons/hi2"
import { AiFillStepBackward, AiFillStepForward, AiOutlineLoading3Quarters } from "react-icons/ai"

import { Song } from "@/types"
import { useHotkey } from "@/hooks/useHotkey"
import usePlayOnPhone from "@/hooks/usePlayOnPhone"
import usePlayer from "@/hooks/usePlayer"
import usePlayerProgress from "@/hooks/usePlayerProgress"
import usePreloadNextTrack from "@/hooks/usePreloadNextTrack"
import useVolumeStore from "@/hooks/useVolumeStore"
import { audioFailureDetail, probeAudioAddress, publicAudioAddress } from "@/libs/audioFailureText"
import { nextAudioFailureStep } from "@/libs/playerAudioFailure"
import { playbackStep, trackFinished } from "@/libs/playerTrackEnd"
import toast from "react-hot-toast"

import { NextSongIcon, RepeatSongIcon } from "./PlayerAdvanceIcons"
import AddToPlaylistButton from "./AddToPlaylistButton"
import LikeButton from "./LikeButton"
import MediaItem from "./MediaItem"
import Slider from "./Slider"

interface PlayerContentProps {
  song: Song
  songUrl: string
  expiresAt?: number
  onRefreshUrl: () => void
}

interface HowlWithHtml5Nodes {
  _sounds?: Array<{
    _id?: number
    _node?: unknown
    _paused?: boolean
  }>
}

const STALL_RECOVERY_DELAY_MS = 5_000
const MAX_STALL_RECOVERY_ATTEMPTS = 3
const MAX_AUDIO_SKIPS = 3
const openAttemptsBySong = new Map<string, number>()
let skippedInARow = 0
const SEEK_STEP_SECONDS = 5
const SHIFT_MODIFIER: Array<"shift"> = ["shift"]

const setMediaPlaybackState = (playbackState: "playing" | "paused") => {
  if (!("mediaSession" in navigator)) return
  navigator.mediaSession.playbackState = playbackState
}

const getHtml5AudioNode = (sound: unknown, soundId?: number | null) => {
  const sounds = (sound as HowlWithHtml5Nodes | null)?._sounds
  if (!sounds?.length) return null

  const activeSound = sounds.find(candidate => candidate._id === soundId) ?? sounds.find(candidate => !candidate._paused) ?? sounds[0]
  return activeSound._node instanceof HTMLAudioElement ? activeSound._node : null
}

const PlayerContent: React.FC<PlayerContentProps> = ({ song, songUrl, expiresAt, onRefreshUrl }) => {
  const {
    ids,
    activeId,
    isLoading,
    playbackCommand,
    playbackCommandId,
    seek: seekValue,
    seekId,
    repeatMode,
    startPlayback,
    setIsLoading,
    setIsPlaying: setIsPlayingInStore,
    setRepeatMode,
    setSavedPosition,
  } = usePlayer()

  const { volume, setVolume } = useVolumeStore()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)

  const Icon = isLoading || isBuffering ? AiOutlineLoading3Quarters : isPlaying ? BsPauseFill : BsPlayFill
  const VolumeIcon = volume === 0 ? HiSpeakerXMark : HiSpeakerWave
  const repeatsThisSong = repeatMode === "one"
  const repeatLabel = repeatsThisSong ? "This song repeats" : "Next song will play"

  // Ref so mediaSession seekto handler always has the latest Howl instance
  const soundRef = useRef<ReturnType<typeof useSound>[1]["sound"]>(null)
  const activeSoundIdRef = useRef<number | null>(null)
  const isPlayingRef = useRef(false)
  const isBufferingRef = useRef(false)
  const isRecoveringRef = useRef(false)
  const playRequestPendingRef = useRef(false)
  const lastPlaybackCommandId = useRef(0)
  const ignoredPauseEventsRef = useRef(0)
  const recoveryAttemptsRef = useRef(0)
  const recoveryTimerRef = useRef<number | null>(null)
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null)
  const recoverStalledPlaybackRef = useRef<() => void>(() => {})
  const handleEndRef = useRef<() => void>(() => {})
  const failSongRef = useRef<(err: unknown) => void>(() => {})
  const hasStartedRef = useRef(false)
  const endHandledRef = useRef(false)
  const lastNativePositionRef = useRef(-1)
  const suppressRestartRef = useRef(false)
  const sameSongReplayRef = useRef(false)

  const seekCurrentSound = useCallback((position?: number) => {
    const currentSound = soundRef.current
    if (!currentSound) return 0
    const soundId = activeSoundIdRef.current
    if (position === undefined) return soundId === null ? currentSound.seek() : currentSound.seek(soundId)
    if (typeof position === "number" && Number.isFinite(position)) {
      suppressRestartRef.current = true
      lastNativePositionRef.current = position
    }
    return soundId === null ? currentSound.seek(position) : currentSound.seek(position, soundId)
  }, [])

  // ?playOnPhone=1 - outreach-tool's music panel plays this song on a phone; see hooks/usePlayOnPhone.ts
  const { postNowPlaying, volumeForHowl } = usePlayOnPhone({
    song,
    songUrl,
    expiresAt,
    getPositionSec: () => {
      const position = seekCurrentSound()
      return typeof position === "number" && Number.isFinite(position) ? position : 0
    },
    getDurationSec: () => {
      const duration = soundRef.current?.duration()
      return typeof duration === "number" && Number.isFinite(duration) ? duration : 0
    },
  })
  // the Howl keeps its callbacks from creation - read the latest postNowPlaying through a ref (same as handleEndRef)
  const postNowPlayingRef = useRef(postNowPlaying)
  useEffect(() => {
    postNowPlayingRef.current = postNowPlaying
  }, [postNowPlaying])

  const playSound = useCallback(() => {
    const currentSound = soundRef.current
    if (!currentSound || currentSound.playing() || playRequestPendingRef.current) return

    if (endHandledRef.current) sameSongReplayRef.current = true
    playRequestPendingRef.current = true
    if (activeSoundIdRef.current === null) currentSound.play()
    else currentSound.play(activeSoundIdRef.current)
  }, [])

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current === null) return
    window.clearTimeout(recoveryTimerRef.current)
    recoveryTimerRef.current = null
  }, [])

  const markPlaybackHealthy = useCallback(() => {
    clearRecoveryTimer()
    isBufferingRef.current = false
    isRecoveringRef.current = false
    recoveryAttemptsRef.current = 0
    setIsBuffering(false)
  }, [clearRecoveryTimer])

  const scheduleStallRecovery = useCallback(() => {
    clearRecoveryTimer()
    recoveryTimerRef.current = window.setTimeout(
      () => recoverStalledPlaybackRef.current(),
      STALL_RECOVERY_DELAY_MS,
    )
  }, [clearRecoveryTimer])

  const markPlaybackStalled = useCallback(() => {
    if (!isPlayingRef.current) return
    if (isBufferingRef.current) return
    isBufferingRef.current = true
    setIsBuffering(true)
    scheduleStallRecovery()
  }, [scheduleStallRecovery])

  // A headphone disconnect or an audio-focus change pauses the <audio> element and sends no mediaSession action.
  // Pause the Howl as well, so its onpause updates the icon.
  // Stall recovery pauses the element on purpose, so skip that case.
  const syncExternalAudioPause = useCallback((event: Event) => {
    const audio = event.currentTarget
    if (!(audio instanceof HTMLAudioElement) || !audio.paused) return
    const currentSound = soundRef.current
    if (!currentSound?.playing()) return
    if (isRecoveringRef.current || isBufferingRef.current) return
    currentSound.pause(activeSoundIdRef.current ?? undefined)
  }, [])

  const noteNativePlayback = useCallback((event: Event) => {
    const audio = event.currentTarget
    if (!(audio instanceof HTMLAudioElement)) return
    audio.loop = false
    const position = audio.currentTime
    const previous = lastNativePositionRef.current
    const step = playbackStep({
      durationSec: audio.duration,
      positionSec: position,
      previousSec: previous,
      ended: audio.ended,
      paused: audio.paused,
      recovering: isRecoveringRef.current,
      seeking: suppressRestartRef.current,
    })
    if (Number.isFinite(position)) {
      if (suppressRestartRef.current) {
        if (Math.abs(position - previous) < 1.5) suppressRestartRef.current = false
      } else {
        lastNativePositionRef.current = position
      }
    }
    if (step === "advance") handleEndRef.current()
    else if (Number.isFinite(position) && position > 1) endHandledRef.current = false
  }, [])

  const detachNativeAudioListeners = useCallback(() => {
    const audio = nativeAudioRef.current
    if (!audio) return
    audio.removeEventListener("waiting", markPlaybackStalled)
    audio.removeEventListener("stalled", markPlaybackStalled)
    audio.removeEventListener("error", markPlaybackStalled)
    audio.removeEventListener("playing", markPlaybackHealthy)
    audio.removeEventListener("pause", syncExternalAudioPause)
    audio.removeEventListener("ended", noteNativePlayback)
    audio.removeEventListener("timeupdate", noteNativePlayback)
    nativeAudioRef.current = null
  }, [markPlaybackHealthy, markPlaybackStalled, noteNativePlayback, syncExternalAudioPause])

  const bindNativeAudioListeners = useCallback(() => {
    const audio = getHtml5AudioNode(soundRef.current, activeSoundIdRef.current)
    if (!audio || nativeAudioRef.current === audio) return

    detachNativeAudioListeners()
    audio.loop = false
    audio.addEventListener("waiting", markPlaybackStalled)
    audio.addEventListener("stalled", markPlaybackStalled)
    audio.addEventListener("error", markPlaybackStalled)
    audio.addEventListener("playing", markPlaybackHealthy)
    audio.addEventListener("pause", syncExternalAudioPause)
    audio.addEventListener("ended", noteNativePlayback)
    audio.addEventListener("timeupdate", noteNativePlayback)
    nativeAudioRef.current = audio
  }, [detachNativeAudioListeners, markPlaybackHealthy, markPlaybackStalled, noteNativePlayback, syncExternalAudioPause])

  const recoverStalledPlayback = useCallback(() => {
    if (!isBufferingRef.current || !isPlayingRef.current) return
    const earlyAudio = getHtml5AudioNode(soundRef.current, activeSoundIdRef.current)
    if (earlyAudio && trackFinished(earlyAudio.duration, earlyAudio.currentTime, earlyAudio.ended)) {
      markPlaybackHealthy()
      handleEndRef.current()
      return
    }
    if (!navigator.onLine) {
      scheduleStallRecovery()
      return
    }

    const currentSound = soundRef.current
    if (!currentSound) {
      scheduleStallRecovery()
      return
    }

    if (expiresAt && Date.now() >= expiresAt - 10_000) {
      const position = seekCurrentSound()
      if (typeof position === "number") setSavedPosition(position)
      onRefreshUrl()
      return
    }

    const nativeAudio = getHtml5AudioNode(currentSound, activeSoundIdRef.current)
    const mediaLength = nativeAudio?.duration
    if (typeof mediaLength !== "number" || !Number.isFinite(mediaLength) || mediaLength <= 0) {
      // Chunked storage leaves the length open while bytes are still arriving.
      // Restarting the element drops those bytes, so a long track never becomes audible.
      scheduleStallRecovery()
      return
    }

    if (recoveryAttemptsRef.current >= MAX_STALL_RECOVERY_ATTEMPTS) {
      clearRecoveryTimer()
      isRecoveringRef.current = false
      currentSound.pause()
      failSongRef.current(new Error("the audio connection did not recover"))
      return
    }

    recoveryAttemptsRef.current += 1
    isRecoveringRef.current = true

    // The first retry goes through Howler so its paused/seek state stays in sync. If that retry is
    // already waiting for `canplaythrough`, only restart the native request on later attempts;
    // asking Howler to play again while its play lock is active would stack queued play commands.
    if (recoveryAttemptsRef.current > 1) {
      getHtml5AudioNode(currentSound, activeSoundIdRef.current)?.load()
      scheduleStallRecovery()
      return
    }

    ignoredPauseEventsRef.current += 1

    const currentPosition = seekCurrentSound()
    currentSound.pause()
    const audio = getHtml5AudioNode(currentSound, activeSoundIdRef.current)
    const restorePosition = () => {
      if (typeof currentPosition === "number") seekCurrentSound(currentPosition)
    }
    if (audio) {
      audio.addEventListener("loadedmetadata", restorePosition, { once: true })
      audio.load()
    } else if (typeof currentPosition === "number") {
      seekCurrentSound(currentPosition)
    }
    if (activeSoundIdRef.current === null) currentSound.play()
    else currentSound.play(activeSoundIdRef.current)
    window.setTimeout(restorePosition, 0)
    window.setTimeout(bindNativeAudioListeners, 0)
    scheduleStallRecovery()
  }, [
    bindNativeAudioListeners,
    clearRecoveryTimer,
    scheduleStallRecovery,
    expiresAt,
    markPlaybackHealthy,
    onRefreshUrl,
    seekCurrentSound,
    setSavedPosition,
  ])

  useEffect(() => {
    recoverStalledPlaybackRef.current = recoverStalledPlayback
  }, [recoverStalledPlayback])

  const cancelStalledPlayback = useCallback(() => {
    markPlaybackHealthy()
    playRequestPendingRef.current = false
    isPlayingRef.current = false
    setIsPlaying(false)
    setIsPlayingInStore(false)
    soundRef.current?.pause()
  }, [markPlaybackHealthy, setIsPlayingInStore])

  const playTrack = useCallback((id: string) => {
    const currentSound = soundRef.current
    const progressStore = usePlayerProgress.getState()
    if (String(id) === String(activeId) && currentSound) {
      seekCurrentSound(0)
      setSavedPosition(0)
      progressStore.setProgress(0)
      if (!currentSound.playing()) playSound()
      return
    }

    startPlayback(id)
  }, [activeId, playSound, seekCurrentSound, setSavedPosition, startPlayback])

  const onPlayNext = useCallback(() => {
    const state = usePlayer.getState()
    const queueIds = state.ids.map(id => String(id))
    const currentIndex = queueIds.indexOf(String(state.activeId ?? ""))
    if (currentIndex < 0) return
    const nextId = queueIds[currentIndex + 1]
    if (nextId) playTrack(nextId)
  }, [playTrack])

  const onPlayPrevious = useCallback(() => {
    const currentIndex = ids.indexOf(activeId ?? "")
    if (currentIndex < 0 || ids.length === 0) return

    const previousIndex = currentIndex === 0 ? ids.length - 1 : currentIndex - 1
    playTrack(ids[previousIndex])
  }, [activeId, ids, playTrack])

  const seekBySeconds = useCallback((deltaSeconds: number) => {
    const currentSound = soundRef.current
    if (!currentSound) return
    const duration = currentSound.duration()
    if (!Number.isFinite(duration) || duration <= 0) return
    const currentPosition = seekCurrentSound()
    if (typeof currentPosition !== "number" || !Number.isFinite(currentPosition)) return
    const position = Math.max(0, Math.min(duration, currentPosition + deltaSeconds))
    seekCurrentSound(position)
    setSavedPosition(position)
    usePlayerProgress.getState().setProgress(position / duration)
    postNowPlayingRef.current(isPlayingRef.current)
  }, [seekCurrentSound, setSavedPosition])

  useHotkey({ hotkey: "ArrowRight", ignoreInputs: true, onKeyPressFn: () => seekBySeconds(SEEK_STEP_SECONDS) })
  useHotkey({ hotkey: "ArrowLeft", ignoreInputs: true, onKeyPressFn: () => seekBySeconds(-SEEK_STEP_SECONDS) })
  useHotkey({ hotkey: "ArrowRight", modifiers: SHIFT_MODIFIER, ignoreInputs: true, onKeyPressFn: onPlayNext })
  useHotkey({ hotkey: "ArrowLeft", modifiers: SHIFT_MODIFIER, ignoreInputs: true, onKeyPressFn: onPlayPrevious })

  const toggleAdvanceMode = () => setRepeatMode(repeatsThisSong ? "next" : "one")

  // useSound keeps the onend callback from Howl creation, so read current state through a ref.
  useEffect(() => {
    endHandledRef.current = false
    hasStartedRef.current = false
    lastNativePositionRef.current = -1
    suppressRestartRef.current = false
    sameSongReplayRef.current = false
  }, [song.id])

  const failCurrentSong = (err: unknown) => {
    const songId = String(song.id)
    const started = hasStartedRef.current || isPlayingRef.current || isBufferingRef.current || isRecoveringRef.current
    const state = usePlayer.getState()
    const queueIds = state.ids.map(id => String(id))
    const index = queueIds.indexOf(songId)
    const nextId = index >= 0 ? queueIds[index + 1] : undefined
    const openAttempts = openAttemptsBySong.get(songId) ?? 0
    const step = nextAudioFailureStep({
      urlNearExpiry: Boolean(expiresAt && Date.now() >= expiresAt - 10_000),
      started,
      recoveryAttempts: recoveryAttemptsRef.current,
      openAttempts,
      repeatOne: state.repeatMode === "one",
      hasNext: Boolean(nextId),
      skippedInARow,
      maxRecoveryAttempts: MAX_STALL_RECOVERY_ATTEMPTS,
      maxOpenAttempts: 1,
      maxSkips: MAX_AUDIO_SKIPS,
    })

    if (step === "refresh") {
      if (!started) openAttemptsBySong.set(songId, openAttempts + 1)
      const position = seekCurrentSound()
      if (typeof position === "number" && position > 0) setSavedPosition(position)
      onRefreshUrl()
      return
    }

    if (step === "recover") {
      console.warn("[player] recoverable media error for", songUrl, err)
      if (!isPlayingRef.current) {
        isPlayingRef.current = true
        setIsPlaying(true)
        setIsPlayingInStore(true)
      }
      if (!isBufferingRef.current) markPlaybackStalled()
      return
    }

    markPlaybackHealthy()
    playRequestPendingRef.current = false
    setIsLoading(false)
    setIsPlaying(false)
    isPlayingRef.current = false
    setIsPlayingInStore(false)

    const reportAudioFailure = (prefix: string) => {
      const audio = getHtml5AudioNode(soundRef.current, activeSoundIdRef.current)
      const address = audio?.currentSrc || songUrl
      const browserMessage = audio?.error?.message ?? ""
      void probeAudioAddress(address).then(probe => {
        toast.error(`${prefix} ${audioFailureDetail(err, {
          browserMessage,
          address: publicAudioAddress(address),
          probe,
        })}`, { duration: 12_000 })
      })
    }

    if (step === "skip" && nextId) {
      skippedInARow += 1
      openAttemptsBySong.delete(songId)
      startPlayback(nextId)
      reportAudioFailure(`Skipped "${song.title}".`)
      return
    }

    skippedInARow = 0
    reportAudioFailure(`Audio failed for "${song.title}".`)
  }

  useEffect(() => {
    failSongRef.current = failCurrentSong
  })

  useEffect(() => {
    handleEndRef.current = () => {
      if (endHandledRef.current) return
      const playerState = usePlayer.getState()
      if (String(playerState.activeId) !== String(song.id)) return
      endHandledRef.current = true
      playRequestPendingRef.current = false
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current)
        recoveryTimerRef.current = null
      }
      isBufferingRef.current = false
      isRecoveringRef.current = false
      setIsBuffering(false)
      const audio = nativeAudioRef.current
      if (audio) {
        audio.loop = false
        if (!audio.paused) audio.pause()
      }
      soundRef.current?.pause(activeSoundIdRef.current ?? undefined)
      if (playerState.repeatMode === "one") {
        playTrack(song.id)
        return
      }
      const queueIds = playerState.ids.map(id => String(id))
      const currentIndex = queueIds.indexOf(String(playerState.activeId ?? ""))
      const nextId = currentIndex >= 0 ? queueIds[currentIndex + 1] : undefined
      if (nextId && nextId !== String(song.id)) onPlayNext()
    }
  }, [onPlayNext, playTrack, setIsPlayingInStore, song.id])

  const [, { pause, sound }] = useSound(songUrl, {
    volume: volumeForHowl(volume),
    format: [song.song_path?.toLowerCase().endsWith(".m4a") ? "mp4" : "mp3"],
    // html5: true streams via <audio> instead of decoding the whole file into Web Audio API memory.
    // Without it, large MP3s (>~10MB) fail with "Decoding audio data failed" in the browser.
    html5: true,
    onplay: (id: number) => {
      const activeIdAtPlay = usePlayer.getState().activeId
      if (activeIdAtPlay !== song.id) return
      activeSoundIdRef.current = id
      const position = seekCurrentSound()
      const replayingThisSong = sameSongReplayRef.current
      sameSongReplayRef.current = false
      if (
        !replayingThisSong &&
        !suppressRestartRef.current &&
        !isRecoveringRef.current &&
        usePlayer.getState().repeatMode !== "one" &&
        typeof position === "number" &&
        position < 1 &&
        (endHandledRef.current || lastNativePositionRef.current >= 2)
      ) {
        playRequestPendingRef.current = false
        soundRef.current?.pause(id)
        if (!endHandledRef.current) handleEndRef.current()
        return
      }
      hasStartedRef.current = true
      openAttemptsBySong.delete(String(song.id))
      skippedInARow = 0
      playRequestPendingRef.current = false
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsPlayingInStore(true)
      setMediaPlaybackState("playing")
      setIsLoading(false)
      window.setTimeout(bindNativeAudioListeners, 0)
      postNowPlayingRef.current(true)
    },
    onend: () => {
      postNowPlayingRef.current(false)
      handleEndRef.current()
    },
    onpause: () => {
      const activeIdAtPause = usePlayer.getState().activeId
      if (activeIdAtPause !== song.id) return
      if (ignoredPauseEventsRef.current > 0) {
        ignoredPauseEventsRef.current -= 1
        return
      }
      if (isBufferingRef.current || isRecoveringRef.current) return
      if (!isPlayingRef.current) return
      playRequestPendingRef.current = false
      markPlaybackHealthy()
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      setMediaPlaybackState("paused")
      postNowPlayingRef.current(false)
    },
    onloaderror: (_id: number, err: unknown) => {
      const activeIdAtLoadError = usePlayer.getState().activeId
      if (activeIdAtLoadError !== song.id) return
      playRequestPendingRef.current = false
      console.error("[player] media error for", songUrl, err)
      failSongRef.current(err)
    },
    onplayerror: (_id: number, err: unknown) => {
      const activeIdAtPlayError = usePlayer.getState().activeId
      if (activeIdAtPlayError !== song.id) return
      playRequestPendingRef.current = false
      const errText = typeof err === "string" ? err : err instanceof Error ? err.message : ""
      const errName = err instanceof DOMException ? err.name : ""
      if (errName === "NotAllowedError" || errText.includes("user interaction")) {
        setIsPlaying(false)
        isPlayingRef.current = false
        setIsPlayingInStore(false)
        setIsLoading(false)
        return
      }
      if (isRecoveringRef.current) {
        console.warn("[player] recovery play error for", songUrl, err)
        return
      }
      console.error("[player] play error for", songUrl, err)
      failSongRef.current(err)
    },
  })

  useEffect(() => {
    soundRef.current = sound ?? null
    bindNativeAudioListeners()
  }, [bindNativeAudioListeners, sound])

  useEffect(() => {
    const handleOnline = () => {
      if (!isBufferingRef.current) return
      clearRecoveryTimer()
      recoverStalledPlaybackRef.current()
    }

    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("online", handleOnline)
      clearRecoveryTimer()
      detachNativeAudioListeners()
    }
  }, [clearRecoveryTimer, detachNativeAudioListeners])

  useEffect(() => {
    const progressStore = usePlayerProgress.getState()
    if (!sound) progressStore.setProgress(0)
  }, [sound])

  usePreloadNextTrack({ currentSong: song, isPlaying, sound, getPosition: seekCurrentSound })

  useEffect(() => {
    if (!sound) return

    return () => {
      playRequestPendingRef.current = false
      const pos = seekCurrentSound()
      const activeIdAtCleanup = usePlayer.getState().activeId
      if (activeIdAtCleanup === song.id && typeof pos === "number" && pos > 0) setSavedPosition(pos)
      if (soundRef.current === sound) soundRef.current = null
      activeSoundIdRef.current = null
      lastPlaybackCommandId.current = 0
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      sound.unload()
    }
  }, [seekCurrentSound, setIsPlayingInStore, setSavedPosition, song.id, sound])

  // Stable refs for mediaSession next/previous handlers
  const onPlayNextRef = useRef(onPlayNext)
  const onPlayPreviousRef = useRef(onPlayPrevious)
  useEffect(() => { onPlayNextRef.current = onPlayNext }, [onPlayNext])
  useEffect(() => { onPlayPreviousRef.current = onPlayPrevious }, [onPlayPrevious])

  // Register mediaSession handlers once. Next and previous read from refs so they use the current functions.
  // Play and pause call requestPlaybackCommand, the same path as the Play button.
  // Player.tsx only handles Space, Escape and F8, so those keys do not run these actions as well.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return

    navigator.mediaSession.setActionHandler("play", () => {
      usePlayer.getState().requestPlaybackCommand("play")
    })
    navigator.mediaSession.setActionHandler("pause", () => {
      usePlayer.getState().requestPlaybackCommand("pause")
    })
    navigator.mediaSession.setActionHandler("previoustrack", () => onPlayPreviousRef.current())
    navigator.mediaSession.setActionHandler("nexttrack", () => onPlayNextRef.current())
    navigator.mediaSession.setActionHandler("seekto", details => {
      const s = soundRef.current
      if (details.seekTime !== undefined && s) {
        const duration = s.duration()
        if (duration) {
          seekCurrentSound(details.seekTime)
          postNowPlayingRef.current(isPlayingRef.current)
        }
      }
    })

    return () => {
      navigator.mediaSession.setActionHandler("play", null)
      navigator.mediaSession.setActionHandler("pause", null)
      navigator.mediaSession.setActionHandler("previoustrack", null)
      navigator.mediaSession.setActionHandler("nexttrack", null)
      navigator.mediaSession.setActionHandler("seekto", null)
    }
  }, [seekCurrentSound])

  // Update metadata when song changes so Chrome mini-player shows the correct track
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.author,
    })
  }, [song.title, song.author])

  useEffect(() => {
    const savedPosition = usePlayer.getState().savedPosition
    if (activeId !== song.id || !sound || playbackCommandId === 0) return
    if (playbackCommandId === lastPlaybackCommandId.current) return
    if (playbackCommand === "pause") {
      if (isLoading) return
      lastPlaybackCommandId.current = playbackCommandId
      if (isBufferingRef.current) cancelStalledPlayback()
      else pause()
      return
    }
    lastPlaybackCommandId.current = playbackCommandId
    if (playbackCommand === "play") {
      if (savedPosition > 0) {
        const restorePosition = () => {
          seekCurrentSound(savedPosition)
          setSavedPosition(0)
        }
        if (sound.playing()) restorePosition()
        else sound.once("play", restorePosition)
      }
      playSound()
    }
  }, [
    activeId,
    cancelStalledPlayback,
    isLoading,
    pause,
    playSound,
    playbackCommand,
    playbackCommandId,
    seekCurrentSound,
    setSavedPosition,
    song.id,
    sound,
  ])

  useEffect(() => {
    if (activeId !== song.id || !sound || seekId === 0 || seekValue === undefined) return
    const applySeek = () => {
      const duration = sound.duration()
      if (!Number.isFinite(duration) || duration <= 0) return
      const position = Math.max(0, Math.min(duration, seekValue * duration))
      seekCurrentSound(position)
      setSavedPosition(position)
      usePlayerProgress.getState().setProgress(position / duration)
      postNowPlayingRef.current(isPlayingRef.current)
    }
    if (sound.duration() > 0) applySeek()
    else {
      sound.once("load", applySeek)
      return () => { sound.off("load", applySeek) }
    }
  }, [activeId, seekCurrentSound, seekId, seekValue, sound, song.id, setSavedPosition])

  const handlePlay = () => {
    if (isLoading && !isPlayingRef.current) return
    if (isBufferingRef.current) {
      cancelStalledPlayback()
      return
    }
    if (!isPlaying) playSound()
    else pause()
  }

  const onReplay = () => playTrack(song.id)

  const toggleMute = () => {
    if (volume === 0) setVolume(1)
    else setVolume(0)
  }

  return (
    <div className="flex h-full w-full">
      {/* Left: Song info. min-w-0 keeps a long title and author inside this column, so they ellipsize before the
          playlist and like icons. Below md it takes the space left of the play button (flex-1) - a fixed 30% column
          let the author run under the play button and the play button cover the like icon on a phone. */}
      <div className="flex min-w-0 flex-1 justify-start overflow-hidden md:w-[30%] md:flex-none">
        <div className="flex w-full min-w-0 items-center gap-x-4">
          <div className="min-w-0 flex-1 overflow-hidden">
            <MediaItem data={song} />
          </div>
          <div className="flex shrink-0 items-center gap-x-4">
            <AddToPlaylistButton song={song} />
            <LikeButton songId={song.id} />
          </div>
        </div>
      </div>

      {/* Mobile play button. No volume slider in this row: at 24rem (outreach-tool's music panel) it collided with the
          like / playlist icons - the phone's music volume lives in the music panel itself (his review 2026-11-02) */}
      <div className="flex shrink-0 items-center pl-3 md:hidden">
        <div
          onClick={handlePlay}
          className="h-10 w-10 flex items-center justify-center rounded-full bg-neon p-1 cursor-pointer shadow-neon-sm hover:bg-neon-strong hover:shadow-neon transition">
          <Icon size={38} className={isLoading || isBuffering ? "animate-spin text-black" : "text-black"} />
        </div>
      </div>

      {/* Center: Controls */}
      <div className="hidden h-full md:flex justify-center items-center flex-1 gap-x-6">
        <AiFillStepBackward
          onClick={onPlayPrevious}
          size={30}
          className="text-neutral-400 cursor-pointer hover:text-neon transition"
        />
        <BsSkipStartFill
          onClick={onReplay}
          size={24}
          className="text-neutral-400 cursor-pointer hover:text-neon transition"
          title="Replay from start"
        />
        <div
          onClick={handlePlay}
          className="flex items-center justify-center h-10 w-10 rounded-full bg-neon p-1 cursor-pointer shadow-neon-sm hover:bg-neon-strong hover:shadow-neon transition">
          <Icon size={38} className={isLoading || isBuffering ? "animate-spin text-black" : "text-black"} />
        </div>
        <AiFillStepForward
          onClick={onPlayNext}
          size={30}
          className="text-neutral-400 cursor-pointer hover:text-neon transition"
        />
        <button
          type="button"
          onClick={toggleAdvanceMode}
          title={repeatLabel}
          aria-label={repeatLabel}
          className={`grid h-8 w-12 cursor-pointer place-items-center border-0 bg-transparent p-0 transition ${repeatsThisSong ? "text-neon drop-shadow-[0_0_4px_rgba(74,222,128,0.3)]" : "text-neutral-400 hover:text-neon"}`}>
          {repeatsThisSong ? <RepeatSongIcon /> : <NextSongIcon />}
        </button>
      </div>

      {/* Right: Volume */}
      <div className="hidden md:flex w-[30%] justify-end">
        <div className="flex items-center gap-x-2 w-[120px]">
          <VolumeIcon onClick={toggleMute} className="cursor-pointer text-neutral-400 hover:text-neon transition" size={34} />
          <Slider value={volume} onChange={value => setVolume(value)} />
        </div>
      </div>
    </div>
  )
}

export default PlayerContent
