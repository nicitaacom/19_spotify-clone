"use client"

import { Song } from "@/types"
import AddToPlaylistButton from "@/components/AddToPlaylistButton"
import DeleteSongButton from "@/components/DeleteSongButton"
import MediaItem from "@/components/MediaItem"
import LikeButton from "@/components/LikeButton"
import useOnPlay from "@/hooks/useOnPlay"
import useOwnerStore from "@/hooks/useOwnerStore"

interface SearchContentProps {
  songs: Song[]
}

const SearchContent: React.FC<SearchContentProps> = ({ songs }) => {
  const onPlay = useOnPlay(songs)
  const { isOwner } = useOwnerStore()

  if (songs.length === 0) {
    return (
      <div
        className="
          flex 
          flex-col 
          gap-y-2 
          w-full 
          px-6 
          text-neutral-400
        ">
        No songs found.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-2 w-full px-6">
      {songs.map((song: Song) => (
        <div key={song.id} className="flex items-center gap-x-4 w-full">
          <div className="flex-1">
            <MediaItem onClick={(id: string) => onPlay(id)} data={song} />
          </div>
          <AddToPlaylistButton song={song} />
          <LikeButton songId={song.id} />
          {isOwner && <DeleteSongButton song={song} />}
        </div>
      ))}
    </div>
  )
}

export default SearchContent
