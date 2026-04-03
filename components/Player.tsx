"use client"

import { useEffect } from "react"
import { AiOutlineLoading3Quarters } from "react-icons/ai"

import usePlayer from "@/hooks/usePlayer"
import useLoadSongUrl from "@/hooks/useLoadSongUrl"
import useGetSongById from "@/hooks/useGetSongById"

import PlayerContent from "./PlayerContent"

const Player = () => {
  const {
    activeId,
    activeSong: currentStoreSong,
    setActiveSong,
    progress,
    requestSeek,
  } = usePlayer()

  const activeSong = currentStoreSong?.id === activeId ? currentStoreSong : undefined
  const { song: fetchedSong } = useGetSongById(activeSong ? undefined : activeId)
  const song = activeSong ?? fetchedSong

  useEffect(() => {
    if (fetchedSong && fetchedSong.id === activeId) {
      setActiveSong(fetchedSong)
    }
  }, [activeId, fetchedSong, setActiveSong])

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
        bg-black 
        w-full 
        h-[80px] 
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
          bg-neutral-800 
          cursor-pointer 
          group/progress
        ">
        <div
          className="relative h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${progress * 100}%` }}>
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
              bg-emerald-500 
              shadow-md 
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
          <PlayerContent song={song} songUrl={songUrl} />
        ) : (
          <div className="flex h-full items-center gap-x-4 text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-neutral-800">
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
