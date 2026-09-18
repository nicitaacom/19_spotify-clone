"use client"

import { useMemo, useState } from "react"
import { FiEdit2, FiLock, FiPlay, FiSearch, FiShuffle } from "react-icons/fi"
import { PlaylistDetail } from "@/types"
import useOnPlay from "@/hooks/useOnPlay"
import MediaItem from "@/components/MediaItem"
import LikeButton from "@/components/LikeButton"
import AddToPlaylistButton from "@/components/AddToPlaylistButton"
import Button from "@/components/Button"
import Input from "@/components/Input"
import SupportLink from "@/components/SupportLink"
import PlaylistEditor from "./PlaylistEditor"
import PlaylistPurchasePanel from "./PlaylistPurchasePanel"

export default function PlaylistDetailContent({
  canManage,
  playlist,
}: {
  canManage: boolean
  playlist: PlaylistDetail
}) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [shuffle, setShuffle] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState<string[]>([])
  const queue = useMemo(() => {
    const songs = playlist.songs.map(item => item.song)
    if (!shuffle) return songs
    return [...songs].sort((a, b) => shuffleSeed.indexOf(a.id) - shuffleSeed.indexOf(b.id))
  }, [playlist.songs, shuffle, shuffleSeed])
  const focusPurchase = () => {
    const panel = document.getElementById("playlist-access")
    panel?.scrollIntoView({ behavior: "smooth", block: "center" })
    panel?.focus({ preventScroll: true })
  }
  const commerce = playlist.commerce
  const onPlay = useOnPlay(queue, commerce?.sales_enabled ? focusPurchase : undefined)
  const playable = queue.filter(song => song.can_play)
  const hasAccess = Boolean(commerce?.purchased || commerce?.can_manage)
  const showPurchase =
    commerce?.ready !== false && Boolean(commerce?.purchased || (commerce?.sales_enabled && !commerce?.can_manage))
  const filtered = playlist.songs.filter(item =>
    `${item.song.title} ${item.song.author}`.toLowerCase().includes(query.toLowerCase().trim())
  )
  const toggleShuffle = () => {
    const ids = playlist.songs.map(item => item.song.id)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    setShuffleSeed(ids)
    setShuffle(!shuffle)
  }

  return (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-6">
      {commerce?.ready === false && (
        <p role="status" className="mb-3 rounded-lg border border-white/10 bg-elevated p-3 text-sm text-neutral-300">
          Playlist access is being set up. Please check back shortly.
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          className="flex w-auto items-center gap-2 px-4 py-2 text-sm"
          disabled={!playable.length}
          onClick={() => onPlay(playable[0].id)}>
          <FiPlay fill="currentColor" size={17} />
          {hasAccess || playable.length === queue.length
            ? "Play playlist"
            : playable.some(song => song.is_paid)
            ? "Play available songs"
            : "Play free songs"}
        </Button>
        <button
          aria-label="Shuffle playlist"
          aria-pressed={shuffle}
          onClick={toggleShuffle}
          className={`rounded-full border p-2.5 transition focus-visible:outline-neon ${
            shuffle ? "border-neon/40 bg-neon/10 text-neon" : "border-white/10 text-neutral-400 hover:text-white"
          }`}>
          <FiShuffle size={19} />
        </button>
        {canManage && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-white/25">
            <FiEdit2 size={14} />
            Edit playlist
          </button>
        )}
      </div>
      <div className={showPurchase ? "mb-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]" : "mb-6"}>
        {showPurchase && (
          <div className="xl:col-start-2 xl:row-start-1">
            <PlaylistPurchasePanel playlist={playlist} />
          </div>
        )}
        <section className="min-w-0 xl:col-start-1 xl:row-start-1" aria-label="Playlist songs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Tracks</h2>
              <p className="mt-1 text-xs text-neutral-500">
                {playlist.songs.length} songs
                {commerce?.ready !== false &&
                  ` · ${playlist.songs.filter(item => !item.song.is_paid).length} free to listen`}
              </p>
            </div>
            <div className="relative w-full sm:w-56">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <Input
                aria-label="Search songs in this playlist"
                className="py-2 pl-9"
                placeholder="Find a song…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-1 flex gap-3 border-b border-white/10 px-3 pb-2 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
            <span className="hidden w-6 text-center sm:block">#</span>
            <span className="flex-1">Title / Artist</span>
            <span>Access</span>
          </div>
          {filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-400">
              {query
                ? "No songs match your search."
                : canManage
                ? "Your playlist is ready for music. Add songs from the library."
                : "New music is on its way. Check back soon."}
            </div>
          )}
          {filtered.map(item => {
            const locked = item.song.can_play === false
            return (
              <div
                key={item.song_id}
                className="group flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5 transition hover:border-white/5 hover:bg-elevated sm:gap-3 sm:px-3">
                <span className="hidden w-6 shrink-0 text-center text-xs text-neutral-500 sm:block">
                  {playlist.songs.indexOf(item) + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <MediaItem data={item.song} onClick={id => onPlay(id)} size={36} />
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 text-[11px] ${
                    locked ? "text-neutral-400" : "text-neon/80"
                  }`}>
                  {item.song.access_unavailable ? (
                    "Unavailable"
                  ) : locked ? (
                    <>
                      <FiLock size={12} />
                      <span className="hidden sm:inline">Locked</span>
                    </>
                  ) : item.song.is_paid ? (
                    "Unlocked"
                  ) : (
                    "Free"
                  )}
                </span>
                <LikeButton songId={item.song.id} />
                <div className="hidden sm:block">
                  <AddToPlaylistButton song={item.song} />
                </div>
              </div>
            )
          })}
        </section>
      </div>
      <footer className="mt-auto border-t border-white/10 pt-3">
        <SupportLink />
        <p className="mt-2 text-xs text-neutral-500">
          Enjoying the music? Support the library with an optional donation. Donations do not unlock playlists.
        </p>
      </footer>
      {editing && <PlaylistEditor playlist={playlist} onClose={() => setEditing(false)} />}
    </div>
  )
}
