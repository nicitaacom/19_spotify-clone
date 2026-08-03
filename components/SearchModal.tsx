"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FiSearch } from "react-icons/fi"

import useSearchModal from "@/hooks/useSearchModal"
import useDebounce from "@/hooks/useDebounce"
import useOnPlay from "@/hooks/useOnPlay"
import useOwnerStore from "@/hooks/useOwnerStore"
import searchSongsAndPlaylistsAction from "@/actions/searchSongsAndPlaylistsAction"
import { Playlist, Song } from "@/types"

import AnimatedSearchModalShell from "./AnimatedSearchModalShell"
import Input from "./Input"
import MediaItem from "./MediaItem"
import DeleteSongButton from "./DeleteSongButton"

const SearchModal = () => {
  const { isOpen, onClose } = useSearchModal()

  const [searchValue, setSearchValue] = useState("")
  const debouncedSearchValue = useDebounce(searchValue, 500)
  const [songs, setSongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [errorMessage, setErrorMessage] = useState("")
  const onPlay = useOnPlay(songs)
  const { isOwner } = useOwnerStore()

  const resetKey = `${isOpen}:${debouncedSearchValue}`
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    if (!isOpen || !debouncedSearchValue) {
      setSongs([])
      setPlaylists([])
    }
  }

  useEffect(() => {
    if (!isOpen || !debouncedSearchValue) return

    const fetchFn = async () => {
      setErrorMessage("")
      const result = await searchSongsAndPlaylistsAction(debouncedSearchValue)
      if (typeof result === "string") {
        setErrorMessage(result)
        return
      }
      setSongs(result.songs)
      setPlaylists(result.playlists)
    }

    fetchFn()
  }, [isOpen, debouncedSearchValue])

  const onChange = (open: boolean) => {
    if (!open) {
      setSearchValue("")
      onClose()
    }
  }

  return (
    <AnimatedSearchModalShell
      isOpen={isOpen}
      onChange={onChange}
      title="Search"
      description="Search songs and playlists."
      contentClassName="md:max-w-[600px] border-neon/20 shadow-neon-lg">
      <div className="flex flex-col gap-y-4">
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neon/70" size={16} />
          <Input
            className="pl-9"
            placeholder="Search songs and playlists..."
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            autoFocus
          />
        </div>

        {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}

        {songs.length > 0 && (
          <div className="flex flex-col gap-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Songs</p>
            {songs.map(song => (
              <div key={song.id} className="flex items-center gap-x-3">
                <div className="flex-1 min-w-0">
                  <MediaItem onClick={id => onPlay(id)} data={song} />
                </div>
                {isOwner && (
                  <DeleteSongButton song={song} onDeleted={() => setSongs(prev => prev.filter(item => item.id !== song.id))} />
                )}
              </div>
            ))}
          </div>
        )}

        {playlists.length > 0 && (
          <div className="flex flex-col gap-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Playlists</p>
            {playlists.map(playlist => (
              <Link
                key={playlist.id}
                href={`/playlists/${playlist.slug}`}
                onClick={() => onChange(false)}
                className="rounded-md border border-white/5 bg-elevated/60 px-3 py-2 text-sm text-white transition hover:border-neon/20 hover:bg-elevated">
                {playlist.title}
              </Link>
            ))}
          </div>
        )}

        {debouncedSearchValue && !errorMessage && songs.length === 0 && playlists.length === 0 && (
          <p className="text-sm text-neutral-400">No results found.</p>
        )}
      </div>
    </AnimatedSearchModalShell>
  )
}

export default SearchModal
