"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { FiEdit2, FiLock, FiMenu, FiPlay, FiSearch, FiShuffle, FiTrash2, FiUnlock } from "react-icons/fi"
import { PlaylistDetail, PlaylistSongWithSong, Song } from "@/types"
import useOnPlay from "@/hooks/useOnPlay"
import usePlayer from "@/hooks/usePlayer"
import useEditSongModal from "@/hooks/useEditSongModal"
import useSuggestSongModal from "@/hooks/useSuggestSongModal"
import MediaItem from "@/components/MediaItem"
import LikeButton from "@/components/LikeButton"
import AddToPlaylistButton from "@/components/AddToPlaylistButton"
import DownloadSongButton from "@/components/DownloadSongButton"
import Button from "@/components/Button"
import Input from "@/components/Input"
import Modal from "@/components/Modal"
import SupportLink from "@/components/SupportLink"
import { formatPlaylistPrice } from "@/libs/commerceRules"
import PlaylistEditor from "./PlaylistEditor"
import PlaylistPurchasePanel from "./PlaylistPurchasePanel"

type DragPreview = { songId: string; destination: number }
type ActiveDrag = { songId: string; source: number; pointerId: number; startY: number; moved: boolean; initialOrder: PlaylistSongWithSong[] }

const iconButtonClass = "grid h-8 w-8 place-items-center rounded text-neutral-400 focus-visible:outline-neon"

function trackColumns(canManage: boolean) {
  return canManage
    ? "grid grid-cols-[2rem_minmax(0,1fr)_auto_8.75rem] items-center gap-x-2 px-1 sm:grid-cols-[2rem_1.5rem_minmax(0,1fr)_auto_11rem] sm:gap-x-3 sm:px-3"
    : "grid grid-cols-[minmax(0,1fr)_auto_4.25rem] items-center gap-x-2 px-1 sm:grid-cols-[1.5rem_minmax(0,1fr)_auto_6.5rem] sm:gap-x-3 sm:px-3"
}

const actionColumnClass = (canManage: boolean) =>
  canManage
    ? "flex w-[8.75rem] items-center justify-center gap-1 sm:w-[11rem]"
    : "flex w-[4.25rem] items-center justify-center gap-1 sm:w-[6.5rem]"

function isAdminUnlocked(song: Song, canManage: boolean) {
  return canManage && song.is_paid === true && song.can_play !== false && !song.access_unavailable
}

function AccessBadge({ song, canManage }: { song: Song; canManage: boolean }) {
  const locked = song.can_play === false
  const adminUnlock = isAdminUnlocked(song, canManage)
  const label = song.access_unavailable
    ? "Unavailable"
    : locked && song.is_paid
      ? "Paid"
      : locked
        ? "Unavailable"
        : adminUnlock
          ? "UNLOCKED - ADMIN"
          : song.is_paid
            ? "Unlocked"
            : "Free"
  const open = label === "Free" || label === "Unlocked" || adminUnlock
  const Icon = open ? FiUnlock : FiLock
  const tone = adminUnlock
    ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
    : open
      ? "border-neon/30 bg-neon/10 text-neon"
      : label === "Paid"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : "border-white/10 bg-white/5 text-neutral-400"

  return (
    <span className={`inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium ${tone}`}>
      <Icon size={12} />
      {label}
    </span>
  )
}

function PlaylistTrackRow({ item, index, playlistTitle, canManage, canEditSong, canReorder, removing, dropEdge, isDragging, onPlay, onEdit, onSuggest, onRemove, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onMove }: {
  item: PlaylistSongWithSong
  index: number
  playlistTitle: string
  canManage: boolean
  canEditSong: boolean
  canReorder: boolean
  removing: boolean
  dropEdge: "top" | "bottom" | null
  isDragging: boolean
  onPlay: (id: string) => void
  onEdit: (song: Song) => void
  onSuggest?: (song: Song) => void
  onRemove: (song: Song) => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>, songId: string) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  onMove: (songId: string, direction: number) => void
}) {
  const adminUnlock = isAdminUnlocked(item.song, canManage)
  const rowTone = isDragging
    ? "border-white/20 bg-elevated"
    : adminUnlock
      ? "border-sky-400/30 bg-sky-500/10 hover:border-sky-300/50 hover:bg-sky-500/15"
      : "border-transparent hover:border-white/5 hover:bg-elevated"
  return (
    <div className={`group relative rounded-md border py-0.5 ${trackColumns(canManage)} ${rowTone}`}>
      {dropEdge && <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-neon ${dropEdge === "top" ? "-top-px" : "-bottom-px"}`} />}
      {canManage && (
        <button type="button" disabled={!canReorder} aria-label={`Reorder ${item.song.title}`}
          aria-keyshortcuts="ArrowUp ArrowDown"
          title="Drag to reorder, or use the arrow keys"
          onPointerDown={event => onPointerDown(event, item.song_id)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onKeyDown={event => {
            const reorderArrow = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown")
            if (!reorderArrow) return
            event.preventDefault()
            onMove(item.song_id, event.key === "ArrowUp" ? -1 : 1)
          }}
          className={`${iconButtonClass} touch-none cursor-grab text-neutral-500 hover:text-white active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30`}>
          <FiMenu size={16} />
        </button>
      )}
      <span className="hidden w-6 shrink-0 text-center text-xs text-neutral-500 sm:block">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <MediaItem data={item.song} onClick={onPlay} size={36} titleClassName={adminUnlock ? "text-sky-100" : undefined} />
      </div>
      <AccessBadge song={item.song} canManage={canManage} />
      <div className={actionColumnClass(canManage)}>
        {canEditSong && (
          <button type="button" onClick={() => onEdit(item.song)} aria-label={`Edit ${item.song.title}`}
            className={`${iconButtonClass} hover:text-white`}>
            <FiEdit2 size={16} />
          </button>
        )}
        {!canEditSong && onSuggest && (
          <button type="button" onClick={() => onSuggest(item.song)} aria-label={`Suggest edit for ${item.song.title}`}
            className={`${iconButtonClass} hover:text-white`}>
            <FiEdit2 size={16} />
          </button>
        )}
        {canManage && (
          <button type="button" disabled={removing} onClick={() => onRemove(item.song)}
            aria-label={`Remove ${item.song.title} from playlist`} title="Remove from playlist"
            className={`${iconButtonClass} hover:text-red-400 disabled:opacity-40`}>
            <FiTrash2 size={16} />
          </button>
        )}
        <LikeButton songId={item.song.id} size={16} className={iconButtonClass} />
        <div className="hidden sm:grid sm:h-8 sm:w-8 sm:place-items-center">
          <AddToPlaylistButton song={item.song} size={16} className={iconButtonClass} />
        </div>
        <DownloadSongButton song={item.song} playlistTitle={playlistTitle} iconSize={16} className={`${iconButtonClass} hover:text-neon disabled:cursor-not-allowed disabled:opacity-40`} />
      </div>
    </div>
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
  const suggestSongModal = useSuggestSongModal()
  const [editing, setEditing] = useState(false)
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [shuffle, setShuffle] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState<string[]>([])
  const [sourceSongs, setSourceSongs] = useState(playlist.songs)
  const [orderedSongs, setOrderedSongs] = useState(playlist.songs)
  const [savingOrder, setSavingOrder] = useState(false)
  const [removingSongId, setRemovingSongId] = useState<string | null>(null)
  const savingOrderRef = useRef(false)
  const orderRef = useRef(playlist.songs)
  const listRef = useRef<HTMLDivElement>(null)
  const activeDrag = useRef<ActiveDrag | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const playlistOrderKey = orderedSongs.map(item => item.song_id).join("\0")
  const seenPlaylistOrderKey = useRef(playlistOrderKey)
  useEffect(() => {
    if (seenPlaylistOrderKey.current === playlistOrderKey) return
    seenPlaylistOrderKey.current = playlistOrderKey
    const player = usePlayer.getState()
    if (player.sourcePlaylistId !== playlist.id) return
    const songsById = new Map(player.songs.map(song => [String(song.id), song]))
    const nextSongs: Song[] = []
    for (const item of orderedSongs) {
      const song = songsById.get(String(item.song_id))
      if (song) nextSongs.push(song)
    }
    const nextIds = nextSongs.map(song => String(song.id))
    const sameOrder = nextIds.length === player.ids.length && nextIds.every((id, index) => id === player.ids[index])
    if (!sameOrder) usePlayer.setState({ songs: nextSongs, ids: nextIds })
  }, [orderedSongs, playlist.id, playlistOrderKey])
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
  const commerce = playlist.commerce
  const handleLockedSong = (id: string) => {
    const song = queue.find(item => item.id === id)
    if (!song?.is_paid) return false
    setPurchaseModalOpen(true)
    return true
  }
  const onPlay = useOnPlay(queue, handleLockedSong, playlist.id)
  const playable = queue.filter(song => song.can_play)
  const hasAccess = Boolean(commerce?.purchased || commerce?.can_manage)
  const showPurchase =
    commerce?.ready !== false && Boolean(commerce?.purchased || (commerce?.sales_enabled && !commerce?.can_manage))
  const filtered = orderedSongs.filter(item =>
    `${item.song.title} ${item.song.author}`.toLowerCase().includes(query.toLowerCase().trim())
  )
  const dropMarker = useMemo(() => {
    if (!dragPreview) return null
    const source = orderedSongs.findIndex(item => item.song_id === dragPreview.songId)
    if (source < 0 || source === dragPreview.destination) return null
    const remaining = orderedSongs.filter(item => item.song_id !== dragPreview.songId)
    const movingUp = dragPreview.destination < source
    const anchor = remaining[movingUp ? dragPreview.destination : dragPreview.destination - 1]
    return anchor ? { songId: anchor.song_id, edge: movingUp ? "top" as const : "bottom" as const } : null
  }, [dragPreview, orderedSongs])
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
  const getDropIndex = (source: number, clientY: number) => {
    const rows = listRef.current?.children
    if (!rows || rows.length !== orderRef.current.length) return source
    // The dragged row stays in place. Search the other rows' midpoints for its insertion slot.
    let first = 0
    let last = rows.length - 1
    while (first < last) {
      const middle = Math.floor((first + last) / 2)
      const row = rows.item(middle >= source ? middle + 1 : middle)
      if (!(row instanceof HTMLElement)) return source
      const bounds = row.getBoundingClientRect()
      if (clientY > bounds.top + bounds.height / 2) first = middle + 1
      else last = middle
    }
    return first
  }
  const startDrag = (event: PointerEvent<HTMLButtonElement>, songId: string) => {
    if (!canManage || savingOrderRef.current || query.trim() || event.button !== 0 || !event.isPrimary) return
    const source = orderRef.current.findIndex(item => item.song_id === songId)
    if (source < 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activeDrag.current = { songId, source, pointerId: event.pointerId, startY: event.clientY, moved: false, initialOrder: orderRef.current }
  }
  const updateDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = activeDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return
    drag.moved = true
    event.preventDefault()
    const destination = getDropIndex(drag.source, event.clientY)
    setDragPreview(previous => previous?.songId === drag.songId && previous.destination === destination
      ? previous
      : { songId: drag.songId, destination })
  }
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = activeDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    activeDrag.current = null
    setDragPreview(null)
    if (!drag.moved || savingOrderRef.current || query.trim()) return
    const previous = drag.initialOrder
    if (previous.length !== orderRef.current.length || previous.some((item, index) => item.song_id !== orderRef.current[index].song_id)) return
    const destination = getDropIndex(drag.source, event.clientY)
    if (drag.source === destination) return
    const next = [...previous]
    next.splice(destination, 0, ...next.splice(drag.source, 1))
    orderRef.current = next
    setOrderedSongs(next)
    persistOrder(previous)
  }
  const cancelDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (activeDrag.current?.pointerId !== event.pointerId) return
    activeDrag.current = null
    setDragPreview(null)
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
    if (shuffle) {
      setShuffle(false)
      return
    }
    if (!window.confirm("Mix these songs into a random order?")) return
    const ids = orderedSongs.map(item => item.song.id)
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
    setShuffleSeed(ids)
    setShuffle(true)
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
            className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-white/25">
            <FiEdit2 size={14} />
            Edit playlist
          </button>
        )}
      </div>
      <div className={showPurchase ? "mb-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]" : "mb-6"}>
        {showPurchase && !purchaseModalOpen && (
          <div className="xl:col-start-2 xl:row-start-1">
            <PlaylistPurchasePanel playlist={playlist} onOpenCheckout={() => setPurchaseModalOpen(true)} />
          </div>
        )}
        <section className="min-w-0 xl:col-start-1 xl:row-start-1" aria-label="Playlist songs">
          <div className="relative mb-4 w-full sm:w-56">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <Input
              aria-label="Search songs in this playlist"
              className="py-2 pl-9"
              placeholder="Find a song…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="mb-1 border-b border-white/10 pb-2" />
          {filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-400">
              {query
                ? "No songs match your search."
                : canManage
                ? "Your playlist is ready for music. Add songs from the library."
                : "New music is on its way. Check back soon."}
            </div>
          )}
          <div ref={listRef}>
            {filtered.map(item => (
              <PlaylistTrackRow key={item.song_id} item={item} index={orderedSongs.indexOf(item)} playlistTitle={playlist.title}
                canManage={canManage} canEditSong={canManage && (item.song.user_id === viewerId || Boolean(commerce?.can_manage))}
                canReorder={canManage && !savingOrder && !query.trim()}
                removing={savingOrder || removingSongId !== null}
                isDragging={dragPreview?.songId === item.song_id}
                dropEdge={dropMarker?.songId === item.song_id ? dropMarker.edge : null}
                onPlay={onPlay} onEdit={editSong} onSuggest={viewerId ? song => suggestSongModal.onOpen(song) : undefined} onRemove={removeSong}
                onPointerDown={startDrag} onPointerMove={updateDrag} onPointerUp={stopDrag} onPointerCancel={cancelDrag}
                onMove={moveSong} />
            ))}
          </div>
        </section>
      </div>
      <footer className="mt-auto border-t border-white/10 pt-3">
        <SupportLink />
        <p className="mt-2 text-xs text-neutral-500">
          Enjoying the music? Support the library with an optional donation. Donations do not unlock playlists.
        </p>
      </footer>
      {editing && <PlaylistEditor playlist={playlist} onClose={() => setEditing(false)} />}
      {purchaseModalOpen && (
        <Modal
          isOpen
          onChange={open => { if (!open) setPurchaseModalOpen(false) }}
          title="Unlock this playlist"
          description={commerce?.sales_enabled
            ? `One-time payment of ${formatPlaylistPrice(commerce.price_cents)} unlocks the paid tracks.`
            : "This playlist has no tracks available for purchase yet."}>
          <PlaylistPurchasePanel playlist={playlist} showAnchor={false} />
        </Modal>
      )}
    </div>
  )
}
