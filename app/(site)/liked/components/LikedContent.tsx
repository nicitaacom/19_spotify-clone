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
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-gradient-to-br from-surface via-surface to-elevated px-6 py-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-neon">
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
    <div className="mb-7 mt-4 flex flex-col gap-y-4 px-6 pb-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">{songs.length} liked {songs.length === 1 ? "song" : "songs"}</p>
        <Button className="flex w-auto items-center gap-2 px-5 py-2 text-sm" onClick={() => onPlay(songs[0].id)}>
          <FaPlay size={10} />
          Play all
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
