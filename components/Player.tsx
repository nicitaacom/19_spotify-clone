"use client"

import { useEffect } from "react"
import { AiOutlineLoading3Quarters } from "react-icons/ai"

import usePlayer from "@/hooks/usePlayer"
import useLoadSongUrl from "@/hooks/useLoadSongUrl"
import useGetSongById from "@/hooks/useGetSongById"

import PlayerContent from "./PlayerContent"

const Player = () => {
  const activeId = usePlayer(state => state.activeId)
  const currentStoreSong = usePlayer(state => state.activeSong)
  const setActiveSong = usePlayer(state => state.setActiveSong)
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

  return (
    <div
      className="
        fixed 
        bottom-0 
        bg-black 
        w-full 
        py-2 
        h-[80px] 
        px-4
      ">
      {song && songUrl ? (
        <PlayerContent key={songUrl} song={song} songUrl={songUrl} />
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
  )
}

export default Player
