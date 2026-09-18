"use client"

import { useEffect, useState } from "react"
import { FieldValues, SubmitHandler, useForm } from "react-hook-form"
import toast from "react-hot-toast"
import { useRouter } from "next/navigation"

import useEditSongModal from "@/hooks/useEditSongModal"

import Modal from "./Modal"
import Input from "./Input"
import Button from "./Button"

const EditSongModal = () => {
  const { isOpen, song, onUpdate, onClose } = useEditSongModal()

  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: { title: "", author: "" },
  })

  useEffect(() => {
    if (song) reset({ title: song.title, author: song.author })
  }, [song, reset])

  const onChange = (open: boolean) => {
    if (!open) {
      reset()
      onClose()
    }
  }

  const onSubmit: SubmitHandler<FieldValues> = async values => {
    if (!song) return
    const title = values.title.trim()
    const author = values.author.trim()
    if (!title) { toast.error("Title is required."); return }
    if (!author) { toast.error("Author is required."); return }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/songs/${song.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, author }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update song.")
      return
    } finally { setIsLoading(false) }

    toast.success("Song updated.")
    onUpdate?.({ ...song, title, author })
    router.refresh()
    onChange(false)
  }

  return (
    <Modal title="Edit song" description="Update the title or author" isOpen={isOpen} onChange={onChange}>
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
        <Button disabled={isLoading} type="submit" className="rounded-md">
          {isLoading ? "Saving..." : "Save"}
        </Button>
      </form>
    </Modal>
  )
}

export default EditSongModal
