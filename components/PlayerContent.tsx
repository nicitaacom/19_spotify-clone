"use client"

import useSound from "use-sound"
import { useEffect, useState } from "react"
import { BsPauseFill, BsPlayFill } from "react-icons/bs"
import { HiSpeakerWave, HiSpeakerXMark } from "react-icons/hi2"
import { AiFillStepBackward, AiFillStepForward, AiOutlineLoading3Quarters } from "react-icons/ai"

import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import usePreloadNextTrack from "@/hooks/usePreloadNextTrack"

import AddToPlaylistButton from "./AddToPlaylistButton"
import LikeButton from "./LikeButton"
import MediaItem from "./MediaItem"
import Slider from "./Slider"

interface PlayerContentProps {
  song: Song
  songUrl: string
}

const PlayerContent: React.FC<PlayerContentProps> = ({ song, songUrl }) => {
  const ids = usePlayer(state => state.ids)
  const activeId = usePlayer(state => state.activeId)
  const songs = usePlayer(state => state.songs)
  const isLoading = usePlayer(state => state.isLoading)
  const setId = usePlayer(state => state.setId)
  const setActiveSong = usePlayer(state => state.setActiveSong)
  const setIsLoading = usePlayer(state => state.setIsLoading)
  const [volume, setVolume] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)

  const Icon = isLoading ? AiOutlineLoading3Quarters : isPlaying ? BsPauseFill : BsPlayFill
  const VolumeIcon = volume === 0 ? HiSpeakerXMark : HiSpeakerWave

  const onPlayNext = () => {
    if (ids.length === 0) {
      return
    }

    const currentIndex = ids.findIndex(id => id === activeId)
    const nextSong = ids[currentIndex + 1]

    if (!nextSong) {
      const firstSong = songs[0]
      setActiveSong(firstSong)
      setIsLoading(true)
      return setId(ids[0])
    }

    setActiveSong(songs.find(queueSong => queueSong.id === nextSong))
    setIsLoading(true)
    setId(nextSong)
  }

  const onPlayPrevious = () => {
    if (ids.length === 0) {
      return
    }

    const currentIndex = ids.findIndex(id => id === activeId)
    const previousSong = ids[currentIndex - 1]

    if (!previousSong) {
      const lastSong = songs[songs.length - 1]
      setActiveSong(lastSong)
      setIsLoading(true)
      return setId(ids[ids.length - 1])
    }

    setActiveSong(songs.find(queueSong => queueSong.id === previousSong))
    setIsLoading(true)
    setId(previousSong)
  }

  const [play, { pause, sound }] = useSound(songUrl, {
    volume: volume,
    onplay: () => {
      setIsPlaying(true)
      setIsLoading(false)
    },
    onend: () => {
      setIsPlaying(false)
      onPlayNext()
    },
    onpause: () => setIsPlaying(false),
    onloaderror: () => setIsLoading(false),
    onplayerror: () => setIsLoading(false),
    format: ["mp3"],
  })

  usePreloadNextTrack({
    currentSong: song,
    isPlaying,
    sound,
  })

  useEffect(() => {
    setIsLoading(true)
    sound?.play()

    return () => {
      sound?.unload()
    }
  }, [setIsLoading, sound])

  const handlePlay = () => {
    if (isLoading) {
      return
    }

    if (!isPlaying) {
      play()
    } else {
      pause()
    }
  }

  const toggleMute = () => {
    if (volume === 0) {
      setVolume(1)
    } else {
      setVolume(0)
    }
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 h-full">
      <div className="flex w-full justify-start">
        <div className="flex items-center gap-x-4">
          <MediaItem data={song} />
          <AddToPlaylistButton song={song} />
          <LikeButton songId={song.id} />
        </div>
      </div>

      <div
        className="
            flex 
            md:hidden 
            col-auto 
            w-full 
            justify-end 
            items-center
          ">
        <div
          onClick={handlePlay}
          className="
              h-10
              w-10
              flex 
              items-center 
              justify-center 
              rounded-full 
              bg-white 
              p-1 
              cursor-pointer
            ">
          <Icon size={30} className={isLoading ? "animate-spin text-black" : "text-black"} />
        </div>
      </div>

      <div
        className="
            hidden
            h-full
            md:flex 
            justify-center 
            items-center 
            w-full 
            max-w-[722px] 
            gap-x-6
          ">
        <AiFillStepBackward
          onClick={onPlayPrevious}
          size={30}
          className="
              text-neutral-400 
              cursor-pointer 
              hover:text-white 
              transition
            "
        />
        <div
          onClick={handlePlay}
          className="
              flex 
              items-center 
              justify-center
              h-10
              w-10 
              rounded-full 
              bg-white 
              p-1 
              cursor-pointer
            ">
          <Icon size={30} className={isLoading ? "animate-spin text-black" : "text-black"} />
        </div>
        <AiFillStepForward
          onClick={onPlayNext}
          size={30}
          className="
              text-neutral-400 
              cursor-pointer 
              hover:text-white 
              transition
            "
        />
      </div>

      <div className="hidden md:flex w-full justify-end pr-2">
        <div className="flex items-center gap-x-2 w-[120px]">
          <VolumeIcon onClick={toggleMute} className="cursor-pointer" size={34} />
          <Slider value={volume} onChange={value => setVolume(value)} />
        </div>
      </div>
    </div>
  )
}

export default PlayerContent
