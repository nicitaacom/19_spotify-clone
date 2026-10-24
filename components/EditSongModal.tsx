"use client"

import { useEffect, useState } from "react"
import { FieldValues, SubmitHandler, useForm } from "react-hook-form"
import toast from "react-hot-toast"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { getSongPlaylistMemberships } from "@/actions/songPlaylistMemberships"
import useAddToPlaylistModal from "@/hooks/useAddToPlaylistModal"
import useEditSongModal from "@/hooks/useEditSongModal"
import useOwnerStore from "@/hooks/useOwnerStore"
import { errorText, httpErrorMessage } from "@/libs/errorText"
import { songTagsWithDraft } from "@/libs/songTags"

import Modal from "./Modal"
import Input from "./Input"
import Button from "./Button"
import { SongTagsInput } from "./SongTagsInput"

const EditSongModal = () => {
  const { isOpen, song, playlistId, onUpdate, onClose } = useEditSongModal()

  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [tagDraft, setTagDraft] = useState<{ songId: string; tags: string[] } | null>(null)
  const { isOwner } = useOwnerStore()
  const addToPlaylistModal = useAddToPlaylistModal()
  const canEditTags = isOwner
  const [playlistMemberships, setPlaylistMemberships] = useState<{ songId: string; items: { id: string; slug: string; title: string }[] } | null>(null)
  const songPlaylists = playlistMemberships && playlistMemberships.songId === song?.id ? playlistMemberships.items : []
  const tags = tagDraft && tagDraft.songId === song?.id ? tagDraft.tags : song?.tags ?? []

  const { register, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: { title: "", author: "", image: null, isPaid: false },
  })

  useEffect(() => {
    if (song) reset({ title: song.title, author: song.author, image: null, isPaid: Boolean(song.is_paid) })
  }, [song, reset])

  useEffect(() => {
    if (!isOpen || !song || !isOwner) return
    let ignore = false
    const songId = song.id
    void getSongPlaylistMemberships(songId).then(items => {
      if (!ignore) setPlaylistMemberships({ songId, items })
    })
    return () => { ignore = true }
  }, [isOpen, isOwner, song])

  const onChange = (open: boolean) => {
    if (!open) onClose()
  }

  const handleTagsChange = (nextTags: string[]) => {
    if (song) setTagDraft({ songId: song.id, tags: nextTags })
  }

  const onSubmit: SubmitHandler<FieldValues> = async (values, event) => {
    if (!song) return
    const title = values.title.trim()
    const author = values.author.trim()
    if (!title) { toast.error("Title is required."); return }
    if (!author) { toast.error("Author is required."); return }

    setIsLoading(true)
    let imagePath = song.image_path
    let submittedTags = tags
    try {
      const form = event?.target instanceof HTMLFormElement ? event.target : null
      if (canEditTags) submittedTags = songTagsWithDraft(tags, form?.querySelector<HTMLInputElement>("[data-song-tags-input]")?.value ?? "")
      const formData = new FormData()
      formData.append("title", title)
      formData.append("author", author)
      if (canEditTags) formData.append("tags", JSON.stringify(submittedTags))
      if (values.image?.[0]) formData.append("image", values.image[0])
      if (playlistId) {
        formData.append("playlistId", playlistId)
        formData.append("isPaid", values.isPaid ? "true" : "false")
      }
      const response = await fetch(`/api/songs/${song.id}`, { method: "PATCH", body: formData })
      const bodyText = await response.text()
      if (!response.ok) {
        throw new Error(httpErrorMessage({
          action: `Update song ${song.id}`,
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          bodyText,
          contentType: response.headers.get("content-type") ?? "",
        }))
      }
      const body = JSON.parse(bodyText) as { image_path?: string }
      imagePath = body.image_path ?? imagePath
    } catch (error) {
      toast.error(errorText(error))
      return
    } finally { setIsLoading(false) }

    toast.success("Song updated.")
    onUpdate?.({ ...song, title, author, image_path: imagePath, ...(canEditTags ? { tags: submittedTags } : {}), is_paid: playlistId ? Boolean(values.isPaid) : song.is_paid })
    router.refresh()
    onChange(false)
  }

  return (
    <Modal
      title="Edit song"
      description="Update the song details"
      isOpen={isOpen}
      onChange={onChange}
      onExitComplete={() => {
        if (isOpen) return
        reset()
        setTagDraft(null)
        setPlaylistMemberships(null)
      }}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-y-4">
        <Input
          id="title"
          disabled={isLoading}
          {...register("title", { required: true })}
          placeholder="Song title"
        />
        <Input
          id="author"
          disabled={isLoading}
          {...register("author", { required: true })}
          placeholder="Song author"
        />
        {canEditTags && <SongTagsInput key={song?.id} id="edit-song-tags" value={tags} onChange={handleTagsChange} disabled={isLoading} />}
        {isOwner && song && (
          <div className="space-y-2 text-sm text-neutral-300">
            <p>
              In playlists:{" "}
              {songPlaylists.map((playlist, index) => (
                <span key={playlist.id}>
                  {index > 0 && ", "}
                  <Link href={`/playlists/${playlist.slug}`} className="text-neon hover:underline">{playlist.title}</Link>
                </span>
              ))}
            </p>
            <button
              type="button"
              className="text-neon hover:underline"
              onClick={() => addToPlaylistModal.onOpen(song)}>
              + Add to playlist
            </button>
          </div>
        )}
        <label className="block space-y-2 text-sm">
          <span>Replace cover image (optional)</span>
          <Input id="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" disabled={isLoading} {...register("image")} />
        </label>
        {playlistId && (
          <label className="flex items-center gap-3 text-sm text-neutral-300">
            <input type="checkbox" disabled={isLoading} className="accent-green-400" {...register("isPaid")} />
            Paid in this playlist
          </label>
        )}
        <Button disabled={isLoading} type="submit" className="rounded-md">
          {isLoading ? "Saving..." : "Save"}
        </Button>
      </form>
    </Modal>
  )
}

export default EditSongModal
