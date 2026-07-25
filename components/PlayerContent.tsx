"use client"

import useSound from "use-sound"
import { useCallback, useEffect, useRef, useState } from "react"
import { BsPauseFill, BsPlayFill, BsRepeat, BsRepeat1, BsSkipStartFill } from "react-icons/bs"
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
}

interface HowlWithHtml5Nodes {
  _sounds?: Array<{
    _node?: unknown
    _paused?: boolean
  }>
}

const STALL_RECOVERY_DELAY_MS = 5_000
const MAX_STALL_RECOVERY_ATTEMPTS = 3

const getHtml5AudioNode = (sound: unknown) => {
  const sounds = (sound as HowlWithHtml5Nodes | null)?._sounds
  if (!sounds?.length) return null

  const activeSound = sounds.find(candidate => !candidate._paused) ?? sounds[0]
  return activeSound._node instanceof HTMLAudioElement ? activeSound._node : null
}

const PlayerContent: React.FC<PlayerContentProps> = ({ song, songUrl }) => {
  const {
    ids,
    activeId,
    songs,
    isLoading,
    playbackCommand,
    playbackCommandId,
    seek: seekValue,
    seekId,
    repeatMode,
    savedPosition,
    setId,
    setActiveSong,
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
  const RepeatIcon = repeatMode === "one" ? BsRepeat1 : BsRepeat

  // Ref so mediaSession seekto handler always has the latest Howl instance
  const soundRef = useRef<ReturnType<typeof useSound>[1]["sound"]>(null)
  const isPlayingRef = useRef(false) // used by onReplay
  const isBufferingRef = useRef(false)
  const isRecoveringRef = useRef(false)
  const ignoredPauseEventsRef = useRef(0)
  const recoveryAttemptsRef = useRef(0)
  const recoveryTimerRef = useRef<number | null>(null)
  const nativeAudioRef = useRef<HTMLAudioElement | null>(null)
  const recoverStalledPlaybackRef = useRef<() => void>(() => {})

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
    const audio = getHtml5AudioNode(soundRef.current)
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
      getHtml5AudioNode(currentSound)?.load()
      scheduleStallRecovery()
      return
    }

    ignoredPauseEventsRef.current += 1

    const currentPosition = currentSound.seek()
    currentSound.pause()
    if (typeof currentPosition === "number") currentSound.seek(currentPosition)
    getHtml5AudioNode(currentSound)?.load()
    currentSound.play()
    window.setTimeout(bindNativeAudioListeners, 0)
    scheduleStallRecovery()
  }, [
    bindNativeAudioListeners,
    clearRecoveryTimer,
    scheduleStallRecovery,
    setIsPlayingInStore,
  ])

  useEffect(() => {
    recoverStalledPlaybackRef.current = recoverStalledPlayback
  }, [recoverStalledPlayback])

  const cancelStalledPlayback = useCallback(() => {
    markPlaybackHealthy()
    isPlayingRef.current = false
    setIsPlaying(false)
    setIsPlayingInStore(false)
    soundRef.current?.pause()
  }, [markPlaybackHealthy, setIsPlayingInStore])

  const onPlayNext = useCallback(() => {
    if (ids.length === 0) return
    const currentIndex = ids.findIndex(id => id === activeId)
    const nextSong = ids[currentIndex + 1]
    if (!nextSong) {
      if (repeatMode === "all") {
        setActiveSong(songs[0])
        setIsLoading(true)
        setId(ids[0])
      }
      return
    }
    setActiveSong(songs.find(s => s.id === nextSong))
    setIsLoading(true)
    setId(nextSong)
  }, [activeId, ids, repeatMode, setActiveSong, setId, setIsLoading, songs])

  const onPlayPrevious = useCallback(() => {
    if (ids.length === 0) return
    const currentIndex = ids.findIndex(id => id === activeId)
    const previousSong = ids[currentIndex - 1]
    if (!previousSong) {
      setActiveSong(songs[songs.length - 1])
      setIsLoading(true)
      setId(ids[ids.length - 1])
      return
    }
    setActiveSong(songs.find(s => s.id === previousSong))
    setIsLoading(true)
    setId(previousSong)
  }, [activeId, ids, setActiveSong, setId, setIsLoading, songs])

  const cycleRepeatMode = () => {
    if (repeatMode === "off") setRepeatMode("all")
    else if (repeatMode === "all") setRepeatMode("one")
    else setRepeatMode("off")
  }

  // use-sound captures the on* callbacks ONCE, at Howl construction time (it spreads them into
  // `new Howl(...)` and never updates them). So any closure variable they read — repeatMode,
  // onPlayNext, etc. — is frozen to the FIRST render's value. That stale onend was the cause of
  // both the "double play" and the "restart instead of resume" bugs: it read repeatMode/onPlayNext
  // as their initial values and triggered playback on a stale instance.
  //
  // Fix: keep the callbacks passed to useSound stable (identity never changes) but have them call
  // through refs that we refresh every render. Howler then always runs the CURRENT logic.
  const handleEndRef = useRef<() => void>(() => {})
  useEffect(() => {
    handleEndRef.current = () => {
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      if (repeatMode === "one") {
        soundRef.current?.seek(0)
        soundRef.current?.play()
      } else {
        onPlayNext()
      }
    }
  }, [repeatMode, onPlayNext, setIsPlayingInStore])

  const [play, { pause, sound }] = useSound(songUrl, {
    volume,
    format: ["mp3"],
    // html5: true streams via <audio> instead of decoding the whole file into Web Audio API memory.
    // Without it, large MP3s (>~10MB) fail with "Decoding audio data failed" in the browser.
    html5: true,
    onplay: () => {
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsPlayingInStore(true)
      setIsLoading(false)
      window.setTimeout(bindNativeAudioListeners, 0)
    },
    onend: () => handleEndRef.current(),
    onpause: () => {
      if (ignoredPauseEventsRef.current > 0) {
        ignoredPauseEventsRef.current -= 1
        return
      }
      if (!isPlayingRef.current) return
      markPlaybackHealthy()
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
    },
    onloaderror: (_id: number, err: unknown) => {
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

  // Single guarded entry point for starting/resuming playback.
  //
  // Why a guard: with html5: true, Howler's .play() does NOT no-op when a sound node is already
  // active — calling it again spawns a SECOND <audio> node, so you hear the track twice at once
  // (the "double play" bug). play() on an already-playing Howl is the only way that happens here,
  // because several paths (autoplay effect, the play-command effect, the play button, replay) can
  // each fire .play() while the previous node is still alive. playing() lets us skip those.
  //
  // Resuming (not restarting): an html5 Howl retains its position across pause(), so a plain
  // .play() continues from where it was — that's the desired "song continues" behaviour. We must
  // NOT seek(0) on a normal resume; only explicit replay/repeat-one do that.
  const playSound = useCallback(() => {
    const s = soundRef.current
    if (!s) {
      play()
      return
    }
    if (s.playing()) return
    s.play()
  }, [play])

  useEffect(() => {
    if (!sound) setProgress(0)
  }, [sound, setProgress])

  usePreloadNextTrack({ currentSong: song, isPlaying, sound })

  const didAutoPlayRef = useRef(false)
  const wasPlayingRef = useRef(false)

  useEffect(() => {
    if (!sound) return

    if (didAutoPlayRef.current) {
      if (wasPlayingRef.current && !sound.playing()) {
        const resumePos = savedPosition
        setSavedPosition(0)
        sound.play()
        if (resumePos > 0) {
          sound.once("play", () => sound.seek(resumePos))
        }
      }
      return
    }

    didAutoPlayRef.current = true
    setIsLoading(true)
    sound.play()

    return () => {
      wasPlayingRef.current = isPlayingRef.current
      const pos = sound.seek()
      if (typeof pos === "number" && pos > 0) setSavedPosition(pos)
      setIsPlayingInStore(false)
      sound.unload()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sound])

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
        if (duration) s.seek(details.seekTime)
      }
    })

    return () => {
      navigator.mediaSession.setActionHandler("previoustrack", null)
      navigator.mediaSession.setActionHandler("nexttrack", null)
      navigator.mediaSession.setActionHandler("seekto", null)
    }
  }, [])

  // Update metadata when song changes so Chrome mini-player shows the correct track
  useEffect(() => {
    if (!("mediaSession" in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.author,
    })
  }, [song.title, song.author])

  const lastPlaybackCommandId = useRef(0)
  useEffect(() => {
    if (activeId !== song.id || isLoading || playbackCommandId === 0) return
    if (playbackCommandId === lastPlaybackCommandId.current) return
    lastPlaybackCommandId.current = playbackCommandId
    if (playbackCommand === "pause") {
      if (isBufferingRef.current) cancelStalledPlayback()
      else pause()
      return
    }
    if (playbackCommand === "play") playSound()
  }, [
    activeId,
    cancelStalledPlayback,
    isLoading,
    pause,
    playSound,
    playbackCommand,
    playbackCommandId,
    song.id,
  ])

  useEffect(() => {
    if (activeId !== song.id || !sound || seekId === 0 || seekValue === undefined) return
    const duration = sound.duration()
    if (duration) sound.seek(seekValue * duration)
  }, [activeId, seekId, seekValue, sound, song.id])

  const handlePlay = () => {
    if (isLoading && !isPlayingRef.current) return
    if (isBufferingRef.current) {
      cancelStalledPlayback()
      return
    }
    if (!isPlaying) playSound()
    else pause()
  }

  const onReplay = () => {
    const s = soundRef.current
    if (!s) return
    s.seek(0)
    // Force a real play() here (not the guarded playSound): after seek(0) Howler may still report
    // playing() === true, but we still want it to (re)start from 0 if it was paused.
    if (!s.playing()) s.play()
  }

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
