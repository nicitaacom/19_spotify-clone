"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FiSearch } from "react-icons/fi"

import useSearchModal from "@/hooks/useSearchModal"
import useDebounce from "@/hooks/useDebounce"
import useOnPlay from "@/hooks/useOnPlay"
import useOwnerStore from "@/hooks/useOwnerStore"
import searchSongsAndPlaylistsAction from "@/actions/searchSongsAndPlaylistsAction"
import { errorText } from "@/libs/errorText"
import { matchedSongTags } from "@/libs/songTags"
import { Playlist, PlaylistOption, Song } from "@/types"

import Input from "./Input"
import Modal from "./Modal"
import MediaItem from "./MediaItem"
import DeleteSongButton from "./DeleteSongButton"

const SearchCtrlKModal = () => {
  const { isOpen, onClose } = useSearchModal()

  const [searchValue, setSearchValue] = useState("")
  const debouncedSearchValue = useDebounce(searchValue, 500)
  const [songs, setSongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [songPlaylists, setSongPlaylists] = useState<Record<string, Pick<PlaylistOption, "id" | "slug" | "title">[]>>({})
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
      setSongPlaylists({})
    }
  }

  useEffect(() => {
    if (!isOpen || !debouncedSearchValue) return

    let isCancelled = false

    const fetchFn = async () => {
      setErrorMessage("")
      try {
        const result = await searchSongsAndPlaylistsAction(debouncedSearchValue)
        if (isCancelled) return

        if (typeof result === "string") {
          setSongs([])
          setPlaylists([])
          setSongPlaylists({})
          setErrorMessage(result)
          return
        }

        setSongs(result.songs)
        setPlaylists(result.playlists)
        setSongPlaylists(result.songPlaylists)
      } catch (error) {
        if (isCancelled) return
        setSongs([])
        setPlaylists([])
        setSongPlaylists({})
        setErrorMessage(errorText(error))
      }
    }

    fetchFn()
    return () => {
      isCancelled = true
    }
  }, [isOpen, debouncedSearchValue])

  const onChange = (open: boolean) => {
    if (!open) onClose()
  }

  const showEmptyState = Boolean(debouncedSearchValue) && !errorMessage && songs.length === 0 && playlists.length === 0
  const showResultList = songs.length > 0 || playlists.length > 0 || showEmptyState

  return (
    <Modal
      isOpen={isOpen}
      onChange={onChange}
      title="Search"
      description="Search songs and playlists."
      contentClassName="flex h-auto max-h-[calc(100dvh-2rem)] flex-col overflow-hidden border-neon/20 shadow-neon-lg md:max-h-[85vh] md:max-w-[600px]"
      bodyClassName="flex h-auto min-h-0 flex-1 flex-col overflow-hidden"
      onOpenAutoFocus={event => event.preventDefault()}
      onExitComplete={() => {
        if (!isOpen) setSearchValue("")
      }}>
      <div className="flex min-h-0 flex-1 flex-col gap-y-4">
        <div className="relative shrink-0">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neon/70" size={16} />
          <Input
            className="pl-9"
            placeholder="Search songs, tags and playlists..."
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            autoFocus
          />
        </div>

        {errorMessage && <p className="shrink-0 text-sm text-red-400">{errorMessage}</p>}

        {showResultList && (
          <div className="scrollbar flex min-h-0 flex-1 flex-col gap-y-4 overflow-x-hidden overflow-y-auto overscroll-contain pr-1">
            {songs.length > 0 && (
              <div className="flex flex-col gap-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Songs</p>
                {songs.map(song => (
                  <div key={song.id} className="flex items-center gap-x-3">
                    <div className="min-w-0 flex-1">
                      <MediaItem
                        onClick={id => onPlay(id)}
                        data={song}
                        playlists={songPlaylists[String(song.id)] ?? []}
                        matchedTags={matchedSongTags(song.tags, debouncedSearchValue)}
                        onPlaylistClick={() => onChange(false)}
                      />
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

            {showEmptyState && <p className="text-sm text-neutral-400">No results found.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default SearchCtrlKModal
