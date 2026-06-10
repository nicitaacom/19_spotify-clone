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
    setId,
    setActiveSong,
    setIsLoading,
    setIsPlaying: setIsPlayingInStore,
    setRepeatMode,
  } = usePlayer()

  const { volume, setVolume } = useVolumeStore()
  const [isPlaying, setIsPlaying] = useState(false)

  const Icon = isLoading ? AiOutlineLoading3Quarters : isPlaying ? BsPauseFill : BsPlayFill
  const VolumeIcon = volume === 0 ? HiSpeakerXMark : HiSpeakerWave
  const RepeatIcon = repeatMode === "one" ? BsRepeat1 : BsRepeat

  // Ref so mediaSession seekto handler always has the latest Howl instance
  const soundRef = useRef<ReturnType<typeof useSound>[1]["sound"]>(null)
  const isPlayingRef = useRef(false) // used by onReplay

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
    },
    onend: () => {
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
      if (repeatMode === "one") {
        soundRef.current?.seek(0)
        play()
      } else {
        onPlayNext()
      }
    },
    onpause: () => {
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsPlayingInStore(false)
    },
    onloaderror: (_id: number, err: unknown) => {
      console.error("[player] load error for", songUrl, err)
      toast.error("Failed to load audio. The file may be missing or unsupported.")
      setIsPlayingInStore(false)
      setIsLoading(false)
    },
    onplayerror: (_id: number, err: unknown) => {
      console.error("[player] play error for", songUrl, err)
      toast.error("Playback error. Try again.")
      setIsPlayingInStore(false)
      setIsLoading(false)
    },
  })

  useEffect(() => { soundRef.current = sound ?? null }, [sound])

  usePreloadNextTrack({ currentSong: song, isPlaying, sound })

  useEffect(() => {
    setIsLoading(true)
    sound?.play()
    return () => {
      setIsPlayingInStore(false)
      sound?.unload()
    }
  }, [setIsLoading, setIsPlayingInStore, sound])

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (playbackCommand === "pause") { pause(); return }
    if (playbackCommand === "play") play()
  }, [activeId, isLoading, pause, play, playbackCommand, playbackCommandId, song.id])

  useEffect(() => {
    if (activeId !== song.id || !sound || seekId === 0 || seekValue === undefined) return
    const duration = sound.duration()
    if (duration) sound.seek(seekValue * duration)
  }, [activeId, seekId, seekValue, sound, song.id])

  const handlePlay = () => {
    if (isLoading) return
    if (!isPlaying) play()
    else pause()
  }

  const onReplay = () => {
    if (!soundRef.current) return
    soundRef.current.seek(0)
    if (!isPlayingRef.current) soundRef.current.play()
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
          className="h-10 w-10 flex items-center justify-center rounded-full bg-white p-1 cursor-pointer">
          <Icon size={30} className={isLoading ? "animate-spin text-black" : "text-black"} />
        </div>
      </div>

      {/* Center: Controls */}
      <div className="hidden h-full md:flex justify-center items-center flex-1 gap-x-6">
        <AiFillStepBackward
          onClick={onPlayPrevious}
          size={30}
          className="text-neutral-400 cursor-pointer hover:text-white transition"
        />
        <BsSkipStartFill
          onClick={onReplay}
          size={24}
          className="text-neutral-400 cursor-pointer hover:text-white transition"
          title="Replay from start"
        />
        <div
          onClick={handlePlay}
          className="flex items-center justify-center h-10 w-10 rounded-full bg-white p-1 cursor-pointer">
          <Icon size={30} className={isLoading ? "animate-spin text-black" : "text-black"} />
        </div>
        <AiFillStepForward
          onClick={onPlayNext}
          size={30}
          className="text-neutral-400 cursor-pointer hover:text-white transition"
        />
        <RepeatIcon
          onClick={cycleRepeatMode}
          size={22}
          className={`cursor-pointer transition ${repeatMode === "off" ? "text-neutral-400 hover:text-white" : "text-white"}`}
        />
      </div>

      {/* Right: Volume */}
      <div className="hidden md:flex w-[30%] justify-end">
        <div className="flex items-center gap-x-2 w-[120px]">
          <VolumeIcon onClick={toggleMute} className="cursor-pointer" size={34} />
          <Slider value={volume} onChange={value => setVolume(value)} />
        </div>
      </div>
    </div>
  )
}

export default PlayerContent
