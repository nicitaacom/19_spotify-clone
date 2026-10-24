"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { AnimatePresence, motion } from "framer-motion"
import { MdMusicNote } from "react-icons/md"
import { FiTrash2, FiPlus, FiEdit2, FiUpload, FiChevronDown } from "react-icons/fi"

import { PlaylistOption, Song } from "@/types"
import { errorText, readHttpError } from "@/libs/errorText"
import { useUser } from "@/hooks/useUser"
import useLoadImage from "@/hooks/useLoadImage"
import useAddToPlaylistModal from "@/hooks/useAddToPlaylistModal"
import useEditSongModal from "@/hooks/useEditSongModal"
import useUploadModal from "@/hooks/useUploadModal"
import Button from "@/components/Button"
import CoverImage from "@/components/CoverImage"
import Input from "@/components/Input"
import useOnEscOrClickOutside from "@/hooks/useOnEscOrClickOutside"

type UploadRange = "all" | "7" | "30" | "365"
type DateOrder = "newest" | "oldest"

interface MySongsContentProps {
  songs: Song[]
  playlistsBySong: Record<string, Pick<PlaylistOption, "id" | "slug" | "title">[]>
  isOwner: boolean
}

function SongRow({ song, playlists, onDelete, onUpdate }: {
  song: Song
  playlists: Pick<PlaylistOption, "id" | "slug" | "title">[]
  onDelete: (id: string) => void
  onUpdate: (updated: Song) => void
}) {
  const imagePath = useLoadImage(song)
  const [deleting, setDeleting] = useState(false)

  const addToPlaylistModal = useAddToPlaylistModal()
  const editSongModal = useEditSongModal()

  const handleDelete = async () => {
    if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/songs/${song.id}/delete`, { method: "DELETE" })
      if (!response.ok) throw new Error(await readHttpError(response, `Delete song ${song.id}`))

      toast.success(`"${song.title}" deleted.`)
      onDelete(song.id)
    } catch (error) {
      toast.error(errorText(error))
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-elevated/60 p-3 transition hover:border-neon/20 hover:bg-elevated">
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
        <CoverImage
          src={imagePath}
          alt={song.title}
          fill
          sizes="56px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        {playlists[0] ? (
          <a href={`/playlists/${encodeURIComponent(playlists[0].slug)}?songId=${encodeURIComponent(song.id)}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-white hover:underline">
            {song.title}
          </a>
        ) : (
          <p className="truncate text-sm font-semibold text-white">{song.title}</p>
        )}
        <p className="truncate text-xs text-neutral-400">By {song.author}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-neutral-500">{playlists.length ? "In your playlists:" : "Not in your playlists"}</span>
          {playlists.map(playlist => (
            <Link key={playlist.id} href={`/playlists/${encodeURIComponent(playlist.slug)}`}
              title={playlist.title}
              className="max-w-full truncate rounded-full border border-white/10 px-2 py-0.5 text-neon/80 hover:border-neon/40 hover:text-neon focus-visible:outline-neon">
              {playlist.title}
            </Link>
          ))}
        </div>
      </div>
      <button
        onClick={() => addToPlaylistModal.onOpen(song)}
        aria-label={`Add ${song.title} to playlist`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-neutral-400 transition hover:border-neon/40 hover:bg-neon/10 hover:text-neon"
      >
        <FiPlus size={15} />
      </button>
      <button
        onClick={() => editSongModal.onOpen(song, onUpdate)}
        aria-label={`Edit ${song.title}`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-neutral-400 transition hover:border-yellow-500/40 hover:bg-yellow-500/10 hover:text-yellow-400"
      >
        <FiEdit2 size={15} />
      </button>
      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${song.title}`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FiTrash2 size={15} />
      </button>
    </div>
  )
}

const menuMotion = {
  initial: { opacity: 0, y: -8, scaleY: 0.92 },
  animate: { opacity: 1, y: 0, scaleY: 1 },
  exit: { opacity: 0, y: -8, scaleY: 0.92 },
  transition: { duration: 0.2, ease: "easeOut" as const },
}

function FilterMenu<Value extends string>({ label, value, options, onChange }: {
  label: string
  value: Value
  options: { value: Value; label: string }[]
  onChange: (value: Value) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useOnEscOrClickOutside(menuRef, () => setOpen(false), open)
  const selected = options.find(option => option.value === value)

  return (
    <div ref={menuRef} className="relative w-40 text-xs text-neutral-300">
      <span className="block">{label}</span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(current => !current)}
        className={`mt-1 flex h-10 w-full items-center justify-between rounded-md border bg-elevated px-3 text-sm text-white ${open ? "border-neon/40" : "border-white/10"}`}>
        <span className="truncate">{selected?.label}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
          <FiChevronDown className="text-neutral-400" size={16} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            key={label}
            role="listbox"
            {...menuMotion}
            style={{ transformOrigin: "top" }}
            className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/15 bg-elevated p-1 shadow-2xl">
            {options.map(option => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full rounded-lg px-3 py-2 text-left text-sm ${option.value === value ? "bg-neon/15 text-white" : "text-neutral-300 hover:bg-white/5"}`}>
                {option.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const MySongsContent: React.FC<MySongsContentProps> = ({ songs: initialSongs, playlistsBySong, isOwner }) => {
  const router = useRouter()
  const { isLoading, user } = useUser()
  const uploadModal = useUploadModal()
  const [sourceSongs, setSourceSongs] = useState(initialSongs)
  const [songs, setSongs] = useState<Song[]>(initialSongs)
  const [search, setSearch] = useState("")
  const [uploadRange, setUploadRange] = useState<UploadRange>("all")
  const [uploadCutoff, setUploadCutoff] = useState<number | null>(null)
  const [dateOrder, setDateOrder] = useState<DateOrder>("newest")
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([])
  const [includeUnassigned, setIncludeUnassigned] = useState(false)
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false)
  const playlistMenuRef = useRef<HTMLDivElement>(null)
  useOnEscOrClickOutside(playlistMenuRef, () => setPlaylistMenuOpen(false), playlistMenuOpen)
  if (initialSongs !== sourceSongs) {
    setSourceSongs(initialSongs)
    setSongs(initialSongs)
  }

  const playlistChoices = useMemo(() => {
    const choices = new Map<string, { id: string; title: string; count: number }>()
    for (const song of songs) {
      for (const playlist of playlistsBySong[String(song.id)] ?? []) {
        const choice = choices.get(playlist.id)
        if (choice) choice.count++
        else choices.set(playlist.id, { id: playlist.id, title: playlist.title, count: 1 })
      }
    }
    return Array.from(choices.values()).sort((a, b) => a.title.localeCompare(b.title))
  }, [songs, playlistsBySong])
  const unassignedCount = useMemo(
    () => songs.filter(song => !playlistsBySong[String(song.id)]?.length).length,
    [songs, playlistsBySong]
  )
  const visibleSongs = useMemo(() => {
    const searchText = search.trim().toLowerCase()
    const selected = new Set(selectedPlaylistIds)
    return songs
      .filter(song => {
        if (searchText && !`${song.title} ${song.author}`.toLowerCase().includes(searchText)) return false
        if (uploadCutoff !== null && !(Date.parse(song.created_at ?? "") >= uploadCutoff)) return false
        if (!selected.size && !includeUnassigned) return true
        const playlists = playlistsBySong[String(song.id)] ?? []
        return (includeUnassigned && playlists.length === 0) || playlists.some(playlist => selected.has(playlist.id))
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.created_at ?? "")
        const bTime = Date.parse(b.created_at ?? "")
        if (!Number.isFinite(aTime)) return Number.isFinite(bTime) ? 1 : 0
        if (!Number.isFinite(bTime)) return -1
        return dateOrder === "newest" ? bTime - aTime : aTime - bTime
      })
  }, [songs, playlistsBySong, search, uploadCutoff, dateOrder, selectedPlaylistIds, includeUnassigned])
  const hasActiveFilters = Boolean(search.trim() || uploadRange !== "all" || dateOrder !== "newest" || selectedPlaylistIds.length || includeUnassigned)
  const clearFilters = () => {
    setSearch("")
    setUploadRange("all")
    setUploadCutoff(null)
    setDateOrder("newest")
    setSelectedPlaylistIds([])
    setIncludeUnassigned(false)
  }
  const togglePlaylist = (playlistId: string) => {
    setSelectedPlaylistIds(current => current.includes(playlistId)
      ? current.filter(id => id !== playlistId)
      : [...current, playlistId])
  }

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/")
    }
  }, [isLoading, user, router])

  const handleDelete = (deletedId: string) => {
    setSongs(prev => prev.filter(s => s.id !== deletedId))
    router.refresh()
  }

  const handleUpdate = (updated: Song) => {
    setSongs(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  if (songs.length === 0) {
    return (
      <div className="px-6 pb-8">
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 px-6 py-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 text-neon">
            <MdMusicNote size={28} />
          </div>
          <h2 className="text-2xl font-semibold text-white">No uploaded songs</h2>
          <p className="mt-3 max-w-md text-sm text-neutral-400">
            Songs you upload will appear here. You can delete any of them from this page.
          </p>
          {isOwner ? (
            <Button className="mt-6 flex w-auto items-center justify-center gap-x-2 px-6 py-3" onClick={uploadModal.onOpen}>
              <FiUpload size={16} />
              Upload song
            </Button>
          ) : (
            <Button className="mt-6 w-auto px-6 py-3" onClick={() => router.push("/")}>
              Go home
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-7 mt-4 flex flex-col gap-y-4 px-6 pb-8">
      <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-red-500/10 via-rose-500/5 to-transparent p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200">Manage</p>
        <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Your uploaded songs</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-300">
          Delete any song you uploaded. Removing it will also remove the audio and image files permanently.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm font-medium text-white">
            {songs.length} {songs.length === 1 ? "song" : "songs"}
          </div>
          {isOwner && (
            <button
              onClick={uploadModal.onOpen}
              className="flex items-center gap-x-2 rounded-full border border-neon/30 bg-elevated px-4 py-2 text-sm font-semibold text-neon transition hover:border-neon/60 hover:bg-elevated/80">
              <FiUpload size={15} />
              Upload song
            </button>
          )}
        </div>
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[180px] flex-1 text-xs text-neutral-300">
              Search songs
              <Input value={search} onChange={event => setSearch(event.target.value)}
                placeholder="Title or artist" className="mt-1 py-2" />
            </label>
            <FilterMenu
              label="Uploaded"
              value={uploadRange}
              options={[
                { value: "all", label: "Any time" },
                { value: "7", label: "Past 7 days" },
                { value: "30", label: "Past 30 days" },
                { value: "365", label: "Past year" },
              ]}
              onChange={range => {
                setUploadRange(range)
                setUploadCutoff(range === "all" ? null : Date.now() - Number(range) * 24 * 60 * 60 * 1000)
              }}
            />
            <FilterMenu
              label="Sort by upload date"
              value={dateOrder}
              options={[
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
              ]}
              onChange={setDateOrder}
            />
            <div ref={playlistMenuRef} className="relative w-56 text-xs text-neutral-300">
              <span className="block">Playlists</span>
              <button
                type="button"
                aria-expanded={playlistMenuOpen}
                aria-haspopup="listbox"
                onClick={() => setPlaylistMenuOpen(open => !open)}
                className={`mt-1 flex h-10 w-full items-center justify-between rounded-md border bg-elevated px-3 text-sm text-white ${playlistMenuOpen ? "border-neon/40" : "border-white/10"}`}>
                <span className="truncate">
                  {selectedPlaylistIds.length || includeUnassigned
                    ? `${selectedPlaylistIds.length + Number(includeUnassigned)} selected`
                    : "All playlists"}
                </span>
                <motion.span animate={{ rotate: playlistMenuOpen ? 180 : 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
                  <FiChevronDown className="text-neutral-400" size={16} />
                </motion.span>
              </button>
              <AnimatePresence>
                {playlistMenuOpen && (
                  <motion.div
                    key="playlist-filter"
                    {...menuMotion}
                    style={{ transformOrigin: "top" }}
                    className="absolute left-0 top-full z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-white/15 bg-elevated p-2 shadow-2xl">
                    <p className="px-2 pb-2 text-[11px] text-neutral-400">Show songs matching any checked option.</p>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5">
                      <input type="checkbox" checked={includeUnassigned} onChange={event => setIncludeUnassigned(event.target.checked)}
                        className="accent-green-400" />
                      <span className="min-w-0 flex-1">Not in your playlists</span>
                      <span className="text-neutral-500">{unassignedCount}</span>
                    </label>
                    {playlistChoices.map(playlist => (
                      <label key={playlist.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5">
                        <input type="checkbox" checked={selectedPlaylistIds.includes(playlist.id)}
                          onChange={() => togglePlaylist(playlist.id)} className="accent-green-400" />
                        <span className="min-w-0 flex-1 truncate" title={playlist.title}>{playlist.title}</span>
                        <span className="text-neutral-500">{playlist.count}</span>
                      </label>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
            <span>Showing {visibleSongs.length} of {songs.length} songs</span>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="text-neon hover:underline focus-visible:outline-neon">
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-y-2">
        {visibleSongs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-neutral-400">
            No songs match these filters.
            <button type="button" onClick={clearFilters} className="ml-2 text-neon hover:underline focus-visible:outline-neon">
              Clear filters
            </button>
          </div>
        )}
        {visibleSongs.map(song => (
          <SongRow key={song.id} song={song} playlists={playlistsBySong[song.id] ?? []}
            onDelete={handleDelete} onUpdate={handleUpdate} />
        ))}
      </div>
    </div>
  )
}

export default MySongsContent
