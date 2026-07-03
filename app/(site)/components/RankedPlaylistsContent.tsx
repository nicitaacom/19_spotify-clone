"use client"

import { useMemo, useState } from "react"
import { FiSearch } from "react-icons/fi"

import { PlaylistSummary } from "@/types"
import useDebounce from "@/hooks/useDebounce"
import Input from "@/components/Input"
import PlaylistCard from "../playlists/components/PlaylistCard"

interface RankedPlaylistsContentProps {
  playlists: PlaylistSummary[]
}

const RankedPlaylistsContent: React.FC<RankedPlaylistsContentProps> = ({ playlists }) => {
  const [searchValue, setSearchValue] = useState("")
  const debouncedSearchValue = useDebounce(searchValue, 500)

  const filteredPlaylists = useMemo(
    () => playlists.filter(playlist => playlist.title.toLowerCase().includes(debouncedSearchValue.toLowerCase())),
    [playlists, debouncedSearchValue],
  )

  return (
    <div className="mt-4 flex flex-col gap-y-4">
      <div className="relative max-w-md">
        <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
        <Input
          className="pl-9"
          placeholder="Search playlists..."
          value={searchValue}
          onChange={event => setSearchValue(event.target.value)}
        />
      </div>

      {filteredPlaylists.length === 0 ? (
        <div className="mt-4 text-neutral-400">No playlists found.</div>
      ) : (
        <div className="grid grid-cols-2 min-[500px]:grid-cols-3 min-[1100px]:grid-cols-5 min-[1280px]:grid-cols-6 min-[1536px]:grid-cols-7 min-[1920px]:grid-cols-9 gap-3">
          {filteredPlaylists.map(playlist => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}
    </div>
  )
}

export default RankedPlaylistsContent
