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
    // the same card width as the playlists grid (RankedPlaylistsContent) - as many 150px+ cards as fit in the row
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 mt-4">
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
