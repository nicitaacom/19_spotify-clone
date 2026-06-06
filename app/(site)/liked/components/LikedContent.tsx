"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AiFillHeart } from "react-icons/ai"
import { FaPlay } from "react-icons/fa"

import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import { useUser } from "@/hooks/useUser"
import useOnPlay from "@/hooks/useOnPlay"
import Button from "@/components/Button"
import SongItem from "@/components/SongItem"

interface LikedContentProps {
  songs: Song[]
}

const LikedContent: React.FC<LikedContentProps> = ({ songs }) => {
  const router = useRouter()
  const { isLoading, user } = useUser()
  const { activeId, isLoading: isPlayerLoading, isPlaying: isPlayerPlaying } = usePlayer()

  const onPlay = useOnPlay(songs)

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/")
    }
  }, [isLoading, user, router])

  if (songs.length === 0) {
    return (
      <div className="px-6 pb-8">
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 px-6 py-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-emerald-300">
            <AiFillHeart size={28} />
          </div>
          <h2 className="text-2xl font-semibold text-white">No liked songs yet</h2>
          <p className="mt-3 max-w-md text-sm text-neutral-400">
            Save the songs you want to come back to and they will appear here with quick play, playlist, and like actions.
          </p>
          <Button className="mt-6 w-auto px-6 py-3" onClick={() => router.push("/")}>
            Discover songs
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-7 flex flex-col gap-y-6 px-6 pb-8">
      <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-emerald-500/15 via-cyan-500/10 to-transparent p-5 shadow-[0_24px_80px_-50px_rgba(16,185,129,0.35)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Collection</p>
            <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Your saved favorites</h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-300">
              Keep your best tracks close by. Every card now gives you quick access to play, add to playlist, and like controls.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-medium text-white">
              {songs.length} liked {songs.length === 1 ? "song" : "songs"}
            </div>
            <Button className="flex w-auto items-center gap-2 px-6 py-3" onClick={() => onPlay(songs[0].id)}>
              <FaPlay size={12} />
              Play liked songs
            </Button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {songs.map(song => (
          <SongItem
            key={song.id}
            data={song}
            onPlay={onPlay}
            isLoading={isPlayerLoading && activeId === song.id}
            isPlaying={isPlayerPlaying && activeId === song.id}
          />
        ))}
      </div>
    </div>
  )
}

export default LikedContent
