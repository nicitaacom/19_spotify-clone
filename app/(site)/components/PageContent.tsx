"use client"

import { Song } from "@/types"
import useOnPlay from "@/hooks/useOnPlay"
import usePlayer from "@/hooks/usePlayer"
import SongItem from "@/components/SongItem"

interface PageContentProps {
  songs: Song[]
}

const PageContent: React.FC<PageContentProps> = ({ songs }) => {
  const onPlay = useOnPlay(songs)
  const { activeId, isLoading: isPlayerLoading, isPlaying: isPlayerPlaying } = usePlayer()

  if (songs.length === 0) {
    return <div className="mt-4 text-neutral-400">No songs available.</div>
  }

  return (
    <div
      className="grid grid-cols-2 min-[500px]:grid-cols-3 min-[1100px]:grid-cols-5 min-[1280px]:grid-cols-6 min-[1536px]:grid-cols-7 min-[1920px]:grid-cols-9 gap-3 mt-4">
      {songs.map((item, index) => (
        <SongItem
          onPlay={(id: string) => onPlay(id)}
          key={item.id}
          data={item}
          isLoading={isPlayerLoading && activeId === item.id}
          isPlaying={isPlayerPlaying && activeId === item.id}
          priority={index === 0}
        />
      ))}
    </div>
  )
}

export default PageContent
