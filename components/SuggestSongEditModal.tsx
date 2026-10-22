"use client"

import { useState } from "react"
import toast from "react-hot-toast"

import useSuggestSongModal from "@/hooks/useSuggestSongModal"
import { SongTagsInput } from "./SongTagsInput"
import Button from "./Button"
import Input from "./Input"
import Modal from "./Modal"

const SuggestSongEditModal = () => {
  const { isOpen, song, onClose } = useSuggestSongModal()
  const [seenSongId, setSeenSongId] = useState(song?.id ?? "")
  const [title, setTitle] = useState(song?.title ?? "")
  const [author, setAuthor] = useState(song?.author ?? "")
  const [tags, setTags] = useState<string[]>(song?.tags ?? [])
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  if ((song?.id ?? "") !== seenSongId) {
    setSeenSongId(song?.id ?? "")
    setTitle(song?.title ?? "")
    setAuthor(song?.author ?? "")
    setTags(song?.tags ?? [])
    setErrorMessage("")
  }

  const onChange = (open: boolean) => {
    if (!open) onClose()
  }

  const sendSuggestion = async () => {
    if (!song) return
    setBusy(true)
    setErrorMessage("")
    try {
      const response = await fetch(`/api/songs/${song.id}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author, tags }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `${response.status} ${response.statusText}`)
      toast.success("Suggestion sent.")
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? `${error.name}: ${error.message}` : "Error: Unknown error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Suggest an edit" description="The site admin reviews this before it changes the song." isOpen={isOpen} onChange={onChange}>
      <div className="flex flex-col gap-y-3">
        <Input value={title} disabled={busy} onChange={event => setTitle(event.currentTarget.value)} placeholder="Title" />
        <Input value={author} disabled={busy} onChange={event => setAuthor(event.currentTarget.value)} placeholder="Author" />
        <SongTagsInput key={song?.id ?? "none"} value={tags} onChange={setTags} disabled={busy} id="suggest-song-tags" />
        {errorMessage && <p role="alert" className="text-xs text-red-300">{errorMessage}</p>}
        <Button disabled={busy} type="button" className="rounded-md" onClick={() => sendSuggestion()}>
          {busy ? "Sending…" : "Send suggestion"}
        </Button>
      </div>
    </Modal>
  )
}

export default SuggestSongEditModal
