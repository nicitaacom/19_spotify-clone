"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import { useSessionContext } from "@supabase/auth-helpers-react"

import useAddToPlaylistModal from "@/hooks/useAddToPlaylistModal"
import useCreatePlaylistModal from "@/hooks/useCreatePlaylistModal"
import { PlaylistOption } from "@/types"
import { useUser } from "@/hooks/useUser"

import Button from "./Button"
import Modal from "./Modal"

const AddToPlaylistModal = () => {
  const router = useRouter()
  const addToPlaylistModal = useAddToPlaylistModal()
  const createPlaylistModal = useCreatePlaylistModal()
  const { supabaseClient } = useSessionContext()
  const { user } = useUser()

  const [playlists, setPlaylists] = useState<PlaylistOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string>()

  useEffect(() => {
    if (!addToPlaylistModal.isOpen || !user) {
      setPlaylists([])
      return
    }

    const fetchPlaylists = async () => {
      setIsLoading(true)

      const { data, error } = await supabaseClient
        .from("playlists")
        .select("id, title, updated_at, visibility")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })

      if (error) {
        toast.error(error.message)
      } else {
        setPlaylists(
          (data ?? []).map(playlist => ({
            id: String(playlist.id),
            title: playlist.title,
            updated_at: playlist.updated_at,
            visibility: playlist.visibility,
          })),
        )
      }

      setIsLoading(false)
    }

    fetchPlaylists()
  }, [addToPlaylistModal.isOpen, supabaseClient, user])

  const onChange = (open: boolean) => {
    if (!open) {
      addToPlaylistModal.onClose()
    }
  }

  const handleCreateShortcut = () => {
    addToPlaylistModal.onClose()
    createPlaylistModal.onOpen()
  }

  const handleAddToPlaylist = async (playlistId: string) => {
    if (!user || !addToPlaylistModal.song) {
      return
    }

    setLoadingPlaylistId(playlistId)

    try {
      const { data: existingPositions, error: positionError } = await supabaseClient
        .from("playlist_songs")
        .select("position")
        .eq("playlist_id", playlistId)
        .order("position", { ascending: false })
        .limit(1)

      if (positionError) {
        throw positionError
      }

      const nextPosition = (existingPositions?.[0]?.position ?? -1) + 1

      const { error: insertError } = await supabaseClient.from("playlist_songs").insert({
        playlist_id: playlistId,
        song_id: addToPlaylistModal.song.id,
        position: nextPosition,
      })

      if (insertError) {
        if ((insertError as { code?: string }).code === "23505") {
          toast.error("This song is already in that playlist.")
          return
        }

        throw insertError
      }

      const { error: touchError } = await supabaseClient
        .from("playlists")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", playlistId)

      if (touchError) {
        throw touchError
      }

      toast.success("Added to playlist!")
      addToPlaylistModal.onClose()
      router.refresh()
    } catch (error) {
      toast.error((error as Error).message || "Failed to add song to playlist.")
    } finally {
      setLoadingPlaylistId(undefined)
    }
  }

  return (
    <Modal
      title={addToPlaylistModal.song ? `Add "${addToPlaylistModal.song.title}"` : "Add to playlist"}
      description="Choose one of your playlists or create a new one."
      isOpen={addToPlaylistModal.isOpen}
      onChange={onChange}>
      <div className="flex flex-col gap-y-3">
        <Button className="bg-white text-black" onClick={handleCreateShortcut}>
          Create new playlist
        </Button>

        {isLoading ? <p className="text-sm text-neutral-400">Loading your playlists...</p> : null}

        {!isLoading && playlists.length === 0 ? (
          <p className="text-sm text-neutral-400">You do not have any playlists yet.</p>
        ) : null}

        {playlists.map(playlist => (
          <button
            key={playlist.id}
            type="button"
            disabled={loadingPlaylistId === playlist.id}
            onClick={() => handleAddToPlaylist(playlist.id)}
            className="flex items-center justify-between rounded-md border border-neutral-700 px-4 py-3 text-left transition hover:border-white/30 hover:bg-neutral-700/40 disabled:cursor-not-allowed disabled:opacity-50">
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{playlist.title}</p>
              <p className="text-xs capitalize text-neutral-400">{playlist.visibility}</p>
            </div>
            <span className="text-sm font-medium text-emerald-300">{loadingPlaylistId === playlist.id ? "Adding..." : "Add"}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export default AddToPlaylistModal
