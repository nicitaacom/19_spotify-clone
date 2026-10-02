"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { Reorder, useDragControls } from "framer-motion"
import { FiEdit2, FiLock, FiPlay, FiSearch, FiShuffle, FiMenu, FiTrash2 } from "react-icons/fi"
import { PlaylistDetail, PlaylistSongWithSong, Song } from "@/types"
import useOnPlay from "@/hooks/useOnPlay"
import useEditSongModal from "@/hooks/useEditSongModal"
import MediaItem from "@/components/MediaItem"
import LikeButton from "@/components/LikeButton"
import AddToPlaylistButton from "@/components/AddToPlaylistButton"
import Button from "@/components/Button"
import Input from "@/components/Input"
import SupportLink from "@/components/SupportLink"
import PlaylistEditor from "./PlaylistEditor"
import PlaylistPurchasePanel from "./PlaylistPurchasePanel"

function PlaylistTrackRow({ item, index, canManage, canEditSong, canReorder, removing, onPlay, onEdit, onRemove, onDragStart, onDragEnd, onMove }: {
  item: PlaylistSongWithSong
  index: number
  canManage: boolean
  canEditSong: boolean
  canReorder: boolean
  removing: boolean
  onPlay: (id: string) => void
  onEdit: (song: Song) => void
  onRemove: (song: Song) => void
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (songId: string, direction: number) => void
}) {
  const controls = useDragControls()
  const locked = item.song.can_play === false
  return (
    <Reorder.Item as="div" value={item.song_id} dragListener={false} dragControls={controls}
      onDragEnd={onDragEnd}
      className="group relative flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5 transition hover:border-white/5 hover:bg-elevated sm:gap-3 sm:px-3">
      {canManage && (
        <button type="button" disabled={!canReorder} aria-label={`Reorder ${item.song.title}`}
          aria-keyshortcuts="ArrowUp ArrowDown"
          title="Drag to reorder, or use the arrow keys"
          onPointerDown={event => { onDragStart(); controls.start(event) }}
          onKeyDown={event => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault()
              onMove(item.song_id, event.key === "ArrowUp" ? -1 : 1)
            }
          }}
          className="touch-none cursor-grab rounded p-1 text-neutral-500 hover:text-white focus-visible:outline-neon active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30">
          <FiMenu size={17} />
        </button>
      )}
      <span className="hidden w-6 shrink-0 text-center text-xs text-neutral-500 sm:block">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <MediaItem data={item.song} onClick={onPlay} size={36} />
      </div>
      <span className={`flex shrink-0 items-center gap-1 text-[11px] ${locked ? "text-neutral-400" : "text-neon/80"}`}>
        {item.song.access_unavailable ? "Unavailable" : locked ? <><FiLock size={12} /><span className="hidden sm:inline">Locked</span></> : item.song.is_paid ? canManage ? "Paid" : "Unlocked" : "Free"}
      </span>
      {canEditSong && (
        <button type="button" onClick={() => onEdit(item.song)} aria-label={`Edit ${item.song.title}`}
          className="rounded p-1 text-neutral-400 hover:text-white focus-visible:outline-neon">
          <FiEdit2 size={15} />
        </button>
      )}
      {canManage && (
        <button type="button" disabled={removing} onClick={() => onRemove(item.song)}
          aria-label={`Remove ${item.song.title} from playlist`} title="Remove from playlist"
          className="rounded p-1 text-neutral-400 hover:text-red-400 focus-visible:outline-neon disabled:opacity-40">
          <FiTrash2 size={15} />
        </button>
      )}
      <LikeButton songId={item.song.id} />
      <div className="hidden sm:block"><AddToPlaylistButton song={item.song} /></div>
    </Reorder.Item>
  )
}

export default function PlaylistDetailContent({
  canManage,
  viewerId,
  playlist,
}: {
  canManage: boolean
  viewerId: string | null
  playlist: PlaylistDetail
}) {
  const router = useRouter()
  const editSongModal = useEditSongModal()
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState("")
  const [shuffle, setShuffle] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState<string[]>([])
  const [sourceSongs, setSourceSongs] = useState(playlist.songs)
  const [orderedSongs, setOrderedSongs] = useState(playlist.songs)
  const [savingOrder, setSavingOrder] = useState(false)
  const [removingSongId, setRemovingSongId] = useState<string | null>(null)
  const savingOrderRef = useRef(false)
  const orderRef = useRef(playlist.songs)
  const dragStartOrder = useRef(playlist.songs)
  if (playlist.songs !== sourceSongs) {
    setSourceSongs(playlist.songs)
    setOrderedSongs(playlist.songs)
  }
  useEffect(() => { orderRef.current = orderedSongs }, [orderedSongs])
  const queue = useMemo(() => {
    const songs = orderedSongs.map(item => item.song)
    if (!shuffle) return songs
    return [...songs].sort((a, b) => shuffleSeed.indexOf(a.id) - shuffleSeed.indexOf(b.id))
  }, [orderedSongs, shuffle, shuffleSeed])
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
  const filtered = orderedSongs.filter(item =>
    `${item.song.title} ${item.song.author}`.toLowerCase().includes(query.toLowerCase().trim())
  )
  const persistOrder = async (previous: PlaylistSongWithSong[]) => {
    if (savingOrderRef.current) return
    const current = orderRef.current
    if (current.every((item, index) => item.song_id === previous[index]?.song_id)) return
    savingOrderRef.current = true
    setSavingOrder(true)
    try {
      const response = await fetch(`/api/playlists/${playlist.id}/order`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds: current.map(item => item.song_id) }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      router.refresh()
    } catch (error) {
      orderRef.current = previous
      setOrderedSongs(previous)
      toast.error(error instanceof Error ? error.message : "Unable to save song order.")
      router.refresh()
    } finally {
      savingOrderRef.current = false
      setSavingOrder(false)
    }
  }
  const moveSong = (songId: string, direction: number) => {
    if (savingOrderRef.current || query.trim()) return
    const previous = orderRef.current
    const index = previous.findIndex(item => item.song_id === songId)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= previous.length) return
    const next = [...previous]
    ;[next[index], next[destination]] = [next[destination], next[index]]
    orderRef.current = next
    setOrderedSongs(next)
    persistOrder(previous)
  }
  const onReorder = (ids: string[]) => {
    if (savingOrderRef.current || query.trim()) return
    const byId = new Map(orderRef.current.map(item => [item.song_id, item]))
    const next = ids.map(id => byId.get(id)).filter((item): item is PlaylistSongWithSong => Boolean(item))
    if (next.length !== orderRef.current.length) return
    orderRef.current = next
    setOrderedSongs(next)
  }
  const editSong = (song: Song) => {
    editSongModal.onOpen(song, updated => {
      const next = orderRef.current.map(item => item.song_id === updated.id ? { ...item, song: updated } : item)
      orderRef.current = next
      setOrderedSongs(next)
    }, playlist.id)
  }
  const removeSong = async (song: Song) => {
    if (savingOrderRef.current || removingSongId) return
    if (!window.confirm(`Remove "${song.title}" from this playlist? The uploaded song will remain in My Songs.`)) return
    setRemovingSongId(song.id)
    try {
      const response = await fetch(`/api/playlists/${playlist.id}/songs/${song.id}`, { method: "DELETE" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      const next = orderRef.current.filter(item => item.song_id !== song.id)
      orderRef.current = next
      setOrderedSongs(next)
      toast.success("Song removed from playlist.")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove song.")
    } finally {
      setRemovingSongId(null)
    }
  }
  const toggleShuffle = () => {
    const ids = orderedSongs.map(item => item.song.id)
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
                {orderedSongs.length} songs
                {commerce?.ready !== false &&
                  ` · ${orderedSongs.filter(item => !item.song.is_paid).length} free to listen`}
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
          <Reorder.Group as="div" axis="y" values={filtered.map(item => item.song_id)} onReorder={onReorder}>
            {filtered.map(item => (
              <PlaylistTrackRow key={item.song_id} item={item} index={orderedSongs.indexOf(item)}
                canManage={canManage} canEditSong={canManage && (item.song.user_id === viewerId || Boolean(commerce?.can_manage))}
                canReorder={canManage && !savingOrder && !query.trim()}
                removing={savingOrder || removingSongId !== null}
                onPlay={onPlay} onEdit={editSong} onRemove={removeSong}
                onDragStart={() => { dragStartOrder.current = orderRef.current }}
                onDragEnd={() => persistOrder(dragStartOrder.current)}
                onMove={moveSong} />
            ))}
          </Reorder.Group>
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
