"use client"

import { useRouter } from "next/navigation"

import { Song } from "@/types"
import { useEffect } from "react"
import { useUser } from "@/hooks/useUser"
import MediaItem from "@/components/MediaItem"
import LikeButton from "@/components/LikeButton"

interface LikedContentProps {
  songs: Song[]
}

export default function LikedContent({ songs }: LikedContentProps) {
  const router = useRouter()

  const { isLoading, user } = useUser()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/")
    }
  }, [isLoading, user, router])

  if (songs.length === 0) {
    return <div className="flex flex-col gap-y-2 w-full px-6 text-neutral-400">No liked songs</div>
  }

  return (
    <div className="flex flex-col gap-y-2 w-full p-6">
      {songs.map(song => (
        <div className="flex items-center gap-x-4 w-full" key={song.id}>
          <div className="flex-1">
            <MediaItem onClick={() => {}} data={song} key={song.id} />
          </div>
          <LikeButton songId={song.id} />
        </div>
      ))}
    </div>
  )
}
