"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import { useSessionContext } from "@supabase/auth-helpers-react"

import useCreatePlaylistModal from "@/hooks/useCreatePlaylistModal"
import { useUser } from "@/hooks/useUser"
import { PlaylistVisibility } from "@/types"
import { getPlaylistSlug } from "@/libs/helpers"

import Button from "./Button"
import Input from "./Input"
import Modal from "./Modal"

const visibilityOptions: PlaylistVisibility[] = ["public", "unlisted", "private"]
const MAX_SLUG_ATTEMPTS = 10

const CreatePlaylistModal = () => {
  const router = useRouter()
  const createPlaylistModal = useCreatePlaylistModal()
  const { supabaseClient } = useSessionContext()
  const { user } = useUser()

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<PlaylistVisibility>("public")
  const [isLoading, setIsLoading] = useState(false)

  const resetForm = () => {
    setTitle("")
    setDescription("")
    setVisibility("public")
  }

  const onChange = (open: boolean) => {
    if (!open) {
      resetForm()
      createPlaylistModal.onClose()
    }
  }

  const handleCreatePlaylist = async () => {
    if (!user || !title.trim()) {
      toast.error("Add a playlist title first.")
      return
    }

    setIsLoading(true)

    const baseSlug = getPlaylistSlug(title)
    const now = new Date().toISOString()

    try {
      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`

        const { error } = await supabaseClient.from("playlists").insert({
          user_id: user.id,
          slug,
          title: title.trim(),
          description: description.trim() || null,
          visibility,
          updated_at: now,
        })

        if (!error) {
          toast.success("Playlist created!")
          createPlaylistModal.onClose()
          resetForm()
          router.push(`/playlists/${slug}`)
          router.refresh()
          return
        }

        if ((error as { code?: string }).code !== "23505") {
          throw error
        }
      }

      toast.error("Could not create a unique playlist link. Please try another title.")
    } catch (error) {
      toast.error((error as Error).message || "Failed to create playlist.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Modal
      title="Create playlist"
      description="Create a new playlist and choose who can open it."
      isOpen={createPlaylistModal.isOpen}
      onChange={onChange}>
      <div className="flex flex-col gap-y-4">
        <Input value={title} disabled={isLoading} onChange={event => setTitle(event.target.value)} placeholder="Playlist title" />
        <textarea
          value={description}
          disabled={isLoading}
          onChange={event => setDescription(event.target.value)}
          placeholder="Description"
          rows={4}
          className="w-full rounded-md border border-transparent bg-neutral-700 px-3 py-3 text-sm placeholder:text-neutral-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <select
          value={visibility}
          disabled={isLoading}
          onChange={event => setVisibility(event.target.value as PlaylistVisibility)}
          className="w-full rounded-md border border-transparent bg-neutral-700 px-3 py-3 text-sm capitalize focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
          {visibilityOptions.map(option => (
            <option key={option} value={option} className="capitalize">
              {option}
            </option>
          ))}
        </select>
        <Button disabled={isLoading || !title.trim()} onClick={handleCreatePlaylist}>
          Create playlist
        </Button>
      </div>
    </Modal>
  )
}

export default CreatePlaylistModal
