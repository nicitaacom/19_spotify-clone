"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { FiArrowUp, FiArrowDown, FiX } from "react-icons/fi"
import { PlaylistDetail, PlaylistVisibility } from "@/types"
import Modal from "@/components/Modal"
import Input from "@/components/Input"
import Button from "@/components/Button"
import PlaylistCommerceFields from "@/components/PlaylistCommerceFields"
import { normalizeYoutubePlaylist, parsePlaylistPrice } from "@/libs/commerceRules"
import supabaseClient from "@/libs/supabaseClient"
import { useAreYouSureModals } from "@/store/modals/useAreYouSureModals"

export default function PlaylistEditor({ playlist, onClose }: { playlist: PlaylistDetail; onClose: () => void }) {
  const router = useRouter()
  const { openModal } = useAreYouSureModals()
  const commerce = playlist.commerce
  const owner = Boolean(commerce?.can_manage)
  const [title, setTitle] = useState(playlist.title)
  const [description, setDescription] = useState(playlist.description ?? "")
  const [visibility, setVisibility] = useState<PlaylistVisibility>(playlist.visibility)
  const [price, setPrice] = useState(String((commerce?.price_cents ?? 200) / 100))
  const [youtube, setYoutube] = useState(commerce?.youtube_url ?? "")
  const [sales, setSales] = useState(commerce?.sales_enabled ?? false)
  const [songs, setSongs] = useState(playlist.songs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const move = (index: number, direction: number) => {
    const next = [...songs]
    const [song] = next.splice(index, 1)
    next.splice(index + direction, 0, song)
    setSongs(next)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      if (owner) {
        const priceCents = parsePlaylistPrice(Math.round(Number(price) * 100))
        const youtubeUrl = normalizeYoutubePlaylist(youtube)
        const response = await fetch("/api/playlists/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: playlist.id,
            title,
            description,
            visibility,
            price_cents: priceCents,
            youtube_url: youtubeUrl,
            sales_enabled: sales,
            songs: songs.map(item => ({ id: item.song.id, is_paid: Boolean(item.song.is_paid) })),
            removed_songs: playlist.songs
              .filter(item => !songs.some(s => s.song_id === item.song_id))
              .map(item => item.song_id),
          }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
      } else {
        const { error: detailsError } = await supabaseClient
          .from("19_playlists")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            visibility,
            updated_at: new Date().toISOString(),
          })
          .eq("id", playlist.id)
        if (detailsError) throw detailsError
        const removed = playlist.songs
          .filter(item => !songs.some(s => s.song_id === item.song_id))
          .map(item => Number(item.song_id))
        if (removed.length) {
          const { error: removeError } = await supabaseClient
            .from("19_playlist_songs")
            .delete()
            .eq("playlist_id", playlist.id)
            .in("song_id", removed)
          if (removeError) throw removeError
        }
        if (songs.length) {
          const { error: orderError } = await supabaseClient.from("19_playlist_songs").upsert(
            songs.map((item, position) => ({ playlist_id: playlist.id, song_id: Number(item.song_id), position })),
            { onConflict: "playlist_id,song_id" }
          )
          if (orderError) throw orderError
        }
      }
      toast.success("Playlist updated.")
      router.refresh()
      onClose()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : (error as { message?: string }).message ?? "Unable to save changes."
      )
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await openModal("areYouSureDeletePlaylist", { title: playlist.title }))) return
    setBusy(true)
    const { error } = await supabaseClient.from("19_playlists").delete().eq("id", playlist.id)
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    toast.success("Playlist deleted.")
    onClose()
    router.push("/playlists")
    router.refresh()
  }

  return (
    <Modal
      isOpen
      onChange={open => {
        if (!open && !busy) onClose()
      }}
      title="Edit playlist"
      description="Update the details and choose what listeners can access."
      contentClassName="md:max-w-2xl overflow-y-auto">
      <form onSubmit={save} className="space-y-5 pb-6">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span>Playlist title</span>
            <Input value={title} required maxLength={200} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Description</span>
            <textarea
              value={description}
              maxLength={5000}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-white/10 bg-elevated p-3 focus:outline-neon"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>Visibility</span>
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value as PlaylistVisibility)}
              className="w-full rounded-md border border-white/10 bg-elevated p-3">
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </label>
          {owner && (
            <>
              <PlaylistCommerceFields price={price} youtube={youtube} onPrice={setPrice} onYoutube={setYoutube} />
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={sales}
                  onChange={e => setSales(e.target.checked)}
                  className="accent-green-400"
                />
                Enable playlist purchases
              </label>
              <p className="text-xs leading-5 text-neutral-400">
                Choose at least one paid song to enable purchases. Free/paid settings apply only to this playlist.
                Price changes only affect new purchases.
              </p>
            </>
          )}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Tracks · {songs.length}</h3>
            {!songs.length && (
              <p className="text-sm text-neutral-400">Add songs from the library after saving this playlist.</p>
            )}
            {songs.map((item, index) => (
              <div key={item.song_id} className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{item.song.title}</span>
                {owner && (
                  <select
                    aria-label={`Access for ${item.song.title}`}
                    value={item.song.is_paid ? "paid" : "free"}
                    onChange={e =>
                      setSongs(
                        songs.map(s =>
                          s.song_id === item.song_id
                            ? { ...s, song: { ...s.song, is_paid: e.target.value === "paid" } }
                            : s
                        )
                      )
                    }
                    className="rounded border border-white/10 bg-surface p-2 text-xs">
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                  </select>
                )}
                <button
                  type="button"
                  aria-label={`Move ${item.song.title} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="p-2 disabled:opacity-25">
                  <FiArrowUp />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${item.song.title} down`}
                  disabled={index === songs.length - 1}
                  onClick={() => move(index, 1)}
                  className="p-2 disabled:opacity-25">
                  <FiArrowDown />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item.song.title}`}
                  onClick={() => setSongs(songs.filter(s => s.song_id !== item.song_id))}
                  className="p-2 text-neutral-400 hover:text-red-400">
                  <FiX />
                </button>
              </div>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        <button type="button" disabled={busy} onClick={remove} className="text-sm text-red-400">
          Delete playlist
        </button>
        <p className="text-xs text-neutral-500">
          Playlists with purchases can be unlisted and closed to new sales, but cannot be deleted or made private.
        </p>
      </form>
    </Modal>
  )
}
