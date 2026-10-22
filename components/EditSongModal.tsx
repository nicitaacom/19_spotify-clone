"use client"

import { useEffect, useState } from "react"
import { FieldValues, SubmitHandler, useForm } from "react-hook-form"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"

import useEditSongModal from "@/hooks/useEditSongModal"
import useOwnerStore from "@/hooks/useOwnerStore"
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
  const canEditTags = isOwner
  const tags = tagDraft && tagDraft.songId === song?.id ? tagDraft.tags : song?.tags ?? []

  const { register, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: { title: "", author: "", image: null, isPaid: false },
  })

  useEffect(() => {
    if (song) reset({ title: song.title, author: song.author, image: null, isPaid: Boolean(song.is_paid) })
  }, [song, reset])

  const onChange = (open: boolean) => {
    if (!open) {
      reset()
      setTagDraft(null)
      onClose()
    }
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
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      imagePath = body.image_path ?? imagePath
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update song.")
      return
    } finally { setIsLoading(false) }

    toast.success("Song updated.")
    onUpdate?.({ ...song, title, author, image_path: imagePath, ...(canEditTags ? { tags: submittedTags } : {}), is_paid: playlistId ? Boolean(values.isPaid) : song.is_paid })
    router.refresh()
    onChange(false)
  }

  return (
    <Modal title="Edit song" description="Update the song details" isOpen={isOpen} onChange={onChange}>
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
