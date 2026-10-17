"use client"

import useSound from "use-sound"
import { useCallback, useEffect, useRef, useState } from "react"
import { BsPauseFill, BsPlayFill, BsSkipStartFill } from "react-icons/bs"
import { MdMusicNote } from "react-icons/md"
import { TbPlaylist } from "react-icons/tb"
import { HiSpeakerWave, HiSpeakerXMark } from "react-icons/hi2"
import { AiFillStepBackward, AiFillStepForward, AiOutlineLoading3Quarters } from "react-icons/ai"

import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import usePreloadNextTrack from "@/hooks/usePreloadNextTrack"
import useVolumeStore from "@/hooks/useVolumeStore"
import toast from "react-hot-toast"

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
    setProgress,
    setRepeatMode,
    setSavedPosition,
  } = usePlayer()

  const { volume, setVolume } = useVolumeStore()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)

  const Icon = isLoading || isBuffering ? AiOutlineLoading3Quarters : isPlaying ? BsPauseFill : BsPlayFill
  const VolumeIcon = volume === 0 ? HiSpeakerXMark : HiSpeakerWave
  const RepeatIcon = repeatMode === "one" ? MdMusicNote : TbPlaylist
  const repeatLabel =
    repeatMode === "one" ? "Repeating this song" : repeatMode === "all" ? "Repeating playlist" : "Repeat is off"

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

  const seekCurrentSound = useCallback((position?: number) => {
    const currentSound = soundRef.current
    if (!currentSound) return 0
    const soundId = activeSoundIdRef.current
    if (position === undefined) return soundId === null ? currentSound.seek() : currentSound.seek(soundId)
    return soundId === null ? currentSound.seek(position) : currentSound.seek(position, soundId)
  }, [])

  const playSound = useCallback(() => {
    const currentSound = soundRef.current
    if (!currentSound || currentSound.playing() || playRequestPendingRef.current) return

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

  const detachNativeAudioListeners = useCallback(() => {
    const audio = nativeAudioRef.current
    if (!audio) return
    audio.removeEventListener("waiting", markPlaybackStalled)
    audio.removeEventListener("stalled", markPlaybackStalled)
    audio.removeEventListener("error", markPlaybackStalled)
    audio.removeEventListener("playing", markPlaybackHealthy)
    nativeAudioRef.current = null
  }, [markPlaybackHealthy, markPlaybackStalled])

  const bindNativeAudioListeners = useCallback(() => {
    const audio = getHtml5AudioNode(soundRef.current, activeSoundIdRef.current)
    if (!audio || nativeAudioRef.current === audio) return

    detachNativeAudioListeners()
    audio.addEventListener("waiting", markPlaybackStalled)
    audio.addEventListener("stalled", markPlaybackStalled)
    audio.addEventListener("error", markPlaybackStalled)
    audio.addEventListener("playing", markPlaybackHealthy)
    nativeAudioRef.current = audio
  }, [detachNativeAudioListeners, markPlaybackHealthy, markPlaybackStalled])

  const recoverStalledPlayback = useCallback(() => {
    if (!isBufferingRef.current || !isPlayingRef.current) return
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

    if (recoveryAttemptsRef.current >= MAX_STALL_RECOVERY_ATTEMPTS) {
      clearRecoveryTimer()
      isRecoveringRef.current = false
      isBufferingRef.current = false
      isPlayingRef.current = false
      setIsBuffering(false)
      setIsPlaying(false)
      setIsPlayingInStore(false)
      currentSound.pause()
      toast.error("Playback stopped because the audio connection could not recover.")
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
    if (typeof currentPosition === "number") seekCurrentSound(currentPosition)
    getHtml5AudioNode(currentSound, activeSoundIdRef.current)?.load()
    if (activeSoundIdRef.current === null) currentSound.play()
    else currentSound.play(activeSoundIdRef.current)
    window.setTimeout(bindNativeAudioListeners, 0)
    scheduleStallRecovery()
  }, [
    bindNativeAudioListeners,
    clearRecoveryTimer,
    scheduleStallRecovery,
    setIsPlayingInStore,
    expiresAt,
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
    if (id === activeId && currentSound) {
      seekCurrentSound(0)
      setSavedPosition(0)
      setProgress(0)
      if (!currentSound.playing()) playSound()
      return
    }

    startPlayback(id)
  }, [activeId, playSound, seekCurrentSound, setProgress, setSavedPosition, startPlayback])

  const onPlayNext = useCallback(() => {
    const currentIndex = ids.indexOf(activeId ?? "")
    if (currentIndex < 0) return

    const nextId = ids[currentIndex + 1]
    if (nextId) {
      playTrack(nextId)
    } else if (repeatMode === "all" && ids[0]) {
      playTrack(ids[0])
    }
  }, [activeId, ids, playTrack, repeatMode])

  const onPlayPrevious = useCallback(() => {
    const currentIndex = ids.indexOf(activeId ?? "")
    if (currentIndex < 0 || ids.length === 0) return

    const previousIndex = currentIndex === 0 ? ids.length - 1 : currentIndex - 1
    playTrack(ids[previousIndex])
  }, [activeId, ids, playTrack])

  const cycleRepeatMode = () => {
    if (repeatMode === "off") setRepeatMode("all")
    else if (repeatMode === "all") setRepeatMode("one")
    else setRepeatMode("off")
  }

  // useSound keeps the onend callback from Howl creation, so read current state through a ref.
  const handleEndRef = useRef<() => void>(() => {})
  useEffect(() => {
    handleEndRef.current = () => {
      const activeIdAtEnd = usePlayer.getState().activeId
      if (activeIdAtEnd !== song.id) return
      playRequestPendingRef.current = false
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      if (repeatMode === "one") {
        playTrack(song.id)
      } else {
        onPlayNext()
      }
    }
  }, [onPlayNext, playTrack, repeatMode, setIsPlayingInStore, song.id])

  const [, { pause, sound }] = useSound(songUrl, {
    volume,
    format: [song.song_path?.toLowerCase().endsWith(".m4a") ? "mp4" : "mp3"],
    // html5: true streams via <audio> instead of decoding the whole file into Web Audio API memory.
    // Without it, large MP3s (>~10MB) fail with "Decoding audio data failed" in the browser.
    html5: true,
    onplay: (id: number) => {
      const activeIdAtPlay = usePlayer.getState().activeId
      if (activeIdAtPlay !== song.id) return
      activeSoundIdRef.current = id
      playRequestPendingRef.current = false
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsPlayingInStore(true)
      setIsLoading(false)
      window.setTimeout(bindNativeAudioListeners, 0)
    },
    onend: () => handleEndRef.current(),
    onpause: () => {
      const activeIdAtPause = usePlayer.getState().activeId
      if (activeIdAtPause !== song.id) return
      if (ignoredPauseEventsRef.current > 0) {
        ignoredPauseEventsRef.current -= 1
        return
      }
      if (!isPlayingRef.current) return
      playRequestPendingRef.current = false
      markPlaybackHealthy()
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
    },
    onloaderror: (_id: number, err: unknown) => {
      const activeIdAtLoadError = usePlayer.getState().activeId
      if (activeIdAtLoadError !== song.id) return
      playRequestPendingRef.current = false
      if (expiresAt && Date.now() >= expiresAt - 10_000) {
        const position = seekCurrentSound()
        if (typeof position === "number") setSavedPosition(position)
        onRefreshUrl()
        return
      }
      if (isPlayingRef.current || isRecoveringRef.current) {
        console.warn("[player] recoverable media error for", songUrl, err)
        markPlaybackStalled()
        return
      }
      markPlaybackHealthy()
      console.error("[player] load error for", songUrl, err)
      toast.error("Failed to load audio. The file may be missing or unsupported.")
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      setIsLoading(false)
    },
    onplayerror: (_id: number, err: unknown) => {
      const activeIdAtPlayError = usePlayer.getState().activeId
      if (activeIdAtPlayError !== song.id) return
      playRequestPendingRef.current = false
      if (isRecoveringRef.current) {
        console.warn("[player] recovery play error for", songUrl, err)
        return
      }
      markPlaybackHealthy()
      console.error("[player] play error for", songUrl, err)
      toast.error("Playback error. Try again.")
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      setIsLoading(false)
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
    if (!sound) setProgress(0)
  }, [sound, setProgress])

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

  // Register mediaSession handlers once — they read from refs so they always use current fns.
  // play/pause/stop are intentionally NOT registered here: the browser fires those as commands
  // (e.g. from a media key), which would double-trigger alongside our own keydown handlers in
  // Player.tsx and cause the button to flicker. next/previous/seek are safe because they
  // only come from explicit user gestures in the Chrome mini-player.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return

    navigator.mediaSession.setActionHandler("previoustrack", () => onPlayPreviousRef.current())
    navigator.mediaSession.setActionHandler("nexttrack", () => onPlayNextRef.current())
    navigator.mediaSession.setActionHandler("seekto", details => {
      const s = soundRef.current
      if (details.seekTime !== undefined && s) {
        const duration = s.duration()
        if (duration) seekCurrentSound(details.seekTime)
      }
    })

    return () => {
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
      setProgress(position / duration)
    }
    if (sound.duration() > 0) applySeek()
    else {
      sound.once("load", applySeek)
      return () => { sound.off("load", applySeek) }
    }
  }, [activeId, seekCurrentSound, seekId, seekValue, sound, song.id, setProgress, setSavedPosition])

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
      {/* Left: Song info */}
      <div className="flex w-[30%] justify-start">
        <div className="flex items-center gap-x-4">
          <MediaItem data={song} />
          <AddToPlaylistButton song={song} />
          <LikeButton songId={song.id} />
        </div>
      </div>

      {/* Mobile play button */}
      <div className="flex md:hidden flex-1 justify-end items-center">
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
        <RepeatIcon
          onClick={cycleRepeatMode}
          size={22}
          title={repeatLabel}
          aria-label={repeatLabel}
          className={`cursor-pointer transition ${repeatMode === "off" ? "text-neutral-400 hover:text-neon" : "text-neon drop-shadow-[0_0_4px_rgba(74,222,128,0.3)]"}`}
        />
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
