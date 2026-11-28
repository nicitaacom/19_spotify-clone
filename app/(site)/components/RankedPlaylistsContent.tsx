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
  const [filter, setFilter] = useState<"All" | "Free" | "Purchased">("All")
  const debouncedSearchValue = useDebounce(searchValue, 500)

  const filteredPlaylists = useMemo(
    () =>
      playlists.filter(
        playlist => {
          const commerceUnavailable = playlist.commerce?.ready === false
          return playlist.title.toLowerCase().includes(debouncedSearchValue.toLowerCase().trim()) &&
          (filter === "All" ||
            (filter === "Free"
              ? !commerceUnavailable && !playlist.commerce?.paid_song_count
              : playlist.commerce?.purchased))
        }
      ),
    [playlists, debouncedSearchValue, filter]
  )

  return (
    <div className="mt-3 flex flex-col gap-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" aria-label="Filter playlists">
          {(["All", "Free", "Purchased"] as const).map(option => (
            <button
              key={option}
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={`rounded-full px-3 py-1.5 text-xs transition focus-visible:outline-neon ${
                filter === option ? "bg-white text-black" : "bg-elevated text-neutral-400 hover:text-white"
              }`}>
              {option}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <FiSearch
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            size={16}
          />
          <Input
            className="py-2 pl-9"
            placeholder="Search playlists..."
            aria-label="Search playlists"
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
          />
        </div>
      </div>

      {filteredPlaylists.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-neutral-400">
          {filter === "Purchased"
            ? "Your purchased playlists will appear here. Sign in to see your collection."
            : "No playlists found. Try another search or filter."}
        </div>
      ) : (
        // a card is 150px+ wide and the row takes as many as fit - the window-width steps jumped from 9 to 7 bigger
        // cards at 1919px (a browser window 1px under 1920)
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {filteredPlaylists.map(playlist => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </div>
      )}
    </div>
  )
}

export default RankedPlaylistsContent
