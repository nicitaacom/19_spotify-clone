"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import { useSessionContext } from "@supabase/auth-helpers-react"
import { AiOutlineArrowDown, AiOutlineArrowUp, AiOutlineDelete } from "react-icons/ai"

import AddToPlaylistButton from "@/components/AddToPlaylistButton"
import Button from "@/components/Button"
import DeleteSongButton from "@/components/DeleteSongButton"
import Input from "@/components/Input"
import LikeButton from "@/components/LikeButton"
import MediaItem from "@/components/MediaItem"
import PlaylistVisibilityBadge from "@/components/PlaylistVisibilityBadge"
import useOnPlay from "@/hooks/useOnPlay"
import useOwnerStore from "@/hooks/useOwnerStore"
import { PlaylistDetail, PlaylistSongWithSong, PlaylistVisibility } from "@/types"
import { useAreYouSureModals } from "@/store/modals/useAreYouSureModals"

interface PlaylistDetailContentProps {
  canManage: boolean
  playlist: PlaylistDetail
}

const reindexPlaylistSongs = (songs: PlaylistSongWithSong[]) =>
  songs.map((song, index) => ({
    ...song,
    position: index,
  }))

const PlaylistDetailContent: React.FC<PlaylistDetailContentProps> = ({ canManage, playlist }) => {
  const router = useRouter()
  const { supabaseClient } = useSessionContext()
  const { isOwner } = useOwnerStore()
  const { openModal } = useAreYouSureModals()

  const [title, setTitle] = useState(playlist.title)
  const [description, setDescription] = useState(playlist.description ?? "")
  const [visibility, setVisibility] = useState<PlaylistVisibility>(playlist.visibility)
  const [songs, setSongs] = useState<PlaylistSongWithSong[]>(playlist.songs)
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  const [isDeletingPlaylist, setIsDeletingPlaylist] = useState(false)
  const [busySongId, setBusySongId] = useState<string>()

  useEffect(() => {
    setTitle(playlist.title)
    setDescription(playlist.description ?? "")
    setVisibility(playlist.visibility)
    setSongs(playlist.songs)
  }, [playlist])

  const queueSongs = useMemo(() => songs.map(item => item.song), [songs])
  const onPlay = useOnPlay(queueSongs)

  const touchPlaylist = async () => {
    const { error } = await supabaseClient.from("19_playlists").update({ updated_at: new Date().toISOString() }).eq("id", playlist.id)

    if (error) {
      throw error
    }
  }

  const persistSongOrder = async (nextSongs: PlaylistSongWithSong[]) => {
    if (nextSongs.length === 0) {
      await touchPlaylist()
      return
    }

    const { error } = await supabaseClient.from("19_playlist_songs").upsert(
      nextSongs.map(item => ({
        playlist_id: playlist.id,
        song_id: Number(item.song_id),
        position: item.position,
      })),
      {
        onConflict: "playlist_id,song_id",
      },
    )

    if (error) {
      throw error
    }

    await touchPlaylist()
  }

  const handleSaveDetails = async () => {
    if (!title.trim()) {
      toast.error("Playlist title is required.")
      return
    }

    setIsSavingDetails(true)

    try {
      const { error } = await supabaseClient
        .from("19_playlists")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          visibility,
          updated_at: new Date().toISOString(),
        })
        .eq("id", playlist.id)

      if (error) {
        throw error
      }

      toast.success("Playlist updated!")
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message || "Failed to update playlist.")
    } finally {
      setIsSavingDetails(false)
    }
  }

  const handleDeletePlaylist = async () => {
    const shouldDelete = await openModal("areYouSureDeletePlaylist", { title: playlist.title })

    if (!shouldDelete) {
      return
    }

    setIsDeletingPlaylist(true)

    try {
      const { error } = await supabaseClient.from("19_playlists").delete().eq("id", playlist.id)

      if (error) {
        throw error
      }

      toast.success("Playlist deleted.")
      router.push("/playlists")
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message || "Failed to delete playlist.")
    } finally {
      setIsDeletingPlaylist(false)
    }
  }

  const handleMoveSong = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction

    if (nextIndex < 0 || nextIndex >= songs.length) {
      return
    }

    const nextSongs = [...songs]
    const [movedSong] = nextSongs.splice(index, 1)
    nextSongs.splice(nextIndex, 0, movedSong)
    const reorderedSongs = reindexPlaylistSongs(nextSongs)

    setBusySongId(movedSong.song.id)

    try {
      await persistSongOrder(reorderedSongs)
      setSongs(reorderedSongs)
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message || "Failed to reorder playlist.")
    } finally {
      setBusySongId(undefined)
    }
  }

  const handleRemoveSong = async (songId: string) => {
    setBusySongId(songId)

    try {
      const { error } = await supabaseClient
        .from("19_playlist_songs")
        .delete()
        .eq("playlist_id", playlist.id)
        .eq("song_id", Number(songId))

      if (error) {
        throw error
      }

      const nextSongs = reindexPlaylistSongs(songs.filter(song => song.song.id !== songId))
      await persistSongOrder(nextSongs)
      setSongs(nextSongs)
      toast.success("Song removed from playlist.")
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message || "Failed to remove song.")
    } finally {
      setBusySongId(undefined)
    }
  }

  return (
    <div className="mb-7 flex flex-col gap-y-6 px-6">
      <div className="flex flex-wrap items-center gap-3">
        <PlaylistVisibilityBadge visibility={playlist.visibility} />
        <span className="text-sm text-neutral-400">Playlist by {playlist.author.full_name || playlist.author.username}</span>
      </div>

      {playlist.description ? <p className="max-w-3xl text-sm text-neutral-300">{playlist.description}</p> : null}

      {canManage ? (
        <div className="rounded-lg border border-white/10 bg-elevated p-4">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Manage playlist</h2>
            <p className="text-sm text-neutral-400">Edit details, visibility, and song order here.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr,220px]">
            <div className="flex flex-col gap-y-4">
              <Input value={title} disabled={isSavingDetails} onChange={event => setTitle(event.target.value)} placeholder="Playlist title" />
              <textarea
                value={description}
                disabled={isSavingDetails}
                onChange={event => setDescription(event.target.value)}
                placeholder="Description"
                rows={4}
                className="w-full rounded-md border border-white/10 bg-elevated px-3 py-3 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neon/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="flex flex-col gap-y-4">
              <select
                value={visibility}
                disabled={isSavingDetails}
                onChange={event => setVisibility(event.target.value as PlaylistVisibility)}
                className="w-full rounded-md border border-white/10 bg-elevated px-3 py-3 text-sm capitalize focus:outline-none focus:border-neon/50 disabled:cursor-not-allowed disabled:opacity-50">
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
              <Button className="rounded-md" disabled={isSavingDetails || !title.trim()} onClick={handleSaveDetails}>
                {isSavingDetails ? "Saving..." : "Save changes"}
              </Button>
              <Button className="rounded-md border-red-500/60 bg-transparent text-red-400 hover:bg-red-500/10 hover:opacity-100" disabled={isDeletingPlaylist} onClick={handleDeletePlaylist}>
                {isDeletingPlaylist ? "Deleting..." : "Delete playlist"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-y-3">
        {songs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-700 px-4 py-10 text-center text-sm text-neutral-400">
            {canManage ? "This playlist is empty. Add songs from any song card or song row." : "This playlist does not have any songs yet."}
          </div>
        ) : null}

        {songs.map((item, index) => (
          <div key={item.song.id} className="flex items-center gap-x-4 rounded-md bg-elevated/60 border border-white/5 p-2 transition hover:border-neon/20">
            <div className="flex-1">
              <MediaItem onClick={id => onPlay(id)} data={item.song} size={48} />
            </div>
            <div className="flex items-center gap-x-3">
              <AddToPlaylistButton song={item.song} />
              <LikeButton songId={item.song.id} />
              {isOwner && <DeleteSongButton song={item.song} />}
              {canManage ? (
                <>
                  <button
                    type="button"
                    aria-label={`Move ${item.song.title} up`}
                    disabled={busySongId === item.song.id || index === 0}
                    onClick={() => handleMoveSong(index, -1)}
                    className="cursor-pointer text-neutral-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                    <AiOutlineArrowUp size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${item.song.title} down`}
                    disabled={busySongId === item.song.id || index === songs.length - 1}
                    onClick={() => handleMoveSong(index, 1)}
                    className="cursor-pointer text-neutral-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                    <AiOutlineArrowDown size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.song.title}`}
                    disabled={busySongId === item.song.id}
                    onClick={() => handleRemoveSong(item.song.id)}
                    className="cursor-pointer text-red-300 transition hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40">
                    <AiOutlineDelete size={20} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PlaylistDetailContent
