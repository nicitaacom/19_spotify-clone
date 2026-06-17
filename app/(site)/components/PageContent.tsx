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
      className="
        grid
        grid-cols-3
        sm:grid-cols-4
        md:grid-cols-5
        lg:grid-cols-6
        xl:grid-cols-7
        2xl:grid-cols-9
        gap-3
        mt-4
      ">
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
