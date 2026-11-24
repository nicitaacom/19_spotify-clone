"use client"

import { useState } from "react"
import Modal from "./Modal"
import Input from "./Input"
import Button from "./Button"
import type { SongUploadConflict } from "@/libs/songCreateGuard"

export default function DuplicateSongModal({ song, onRename, onReplace, onCancel }: {
  song: SongUploadConflict
  onRename: (title: string) => void
  onReplace: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(`${song.title} (copy)`)
  const [error, setError] = useState("")

  const uploadWithNewName = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const newTitle = title.trim()
    if (!newTitle || newTitle === song.title) {
      setError("Enter a different song title to upload a separate copy.")
      return
    }
    onRename(newTitle)
  }

  return (
    <Modal
      isOpen
      onChange={open => { if (!open) onCancel() }}
      title="Song already exists"
      description={`“${song.title}” is already in your library. Choose what to do with this upload.`}
      contentClassName="h-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto md:max-w-[500px]"
      descriptionClassName="break-words text-left"
      titleClassName="text-left"
      onOpenAutoFocus={event => {
        event.preventDefault()
        document.getElementById("duplicate-song-title")?.focus()
      }}>
      <form onSubmit={uploadWithNewName} className="space-y-4">
        <div>
          <label htmlFor="duplicate-song-title" className="mb-2 block text-sm text-neutral-300">New song title</label>
          <Input
            id="duplicate-song-title"
            value={title}
            onChange={event => { setTitle(event.target.value); setError("") }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "duplicate-song-error" : undefined}
          />
          {error && <p id="duplicate-song-error" role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
        <Button type="submit">Upload with new name</Button>
        <div className="border-t border-white/10 pt-4">
          <button type="button" onClick={onReplace} className="w-full rounded-full border border-neon/30 bg-elevated px-4 py-3 font-semibold text-neon hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon">
            Replace existing song
          </button>
          <p className="mt-2 text-sm text-neutral-400">Replace its audio, cover, and details. Keep its playlist links and likes.</p>
        </div>
        <button type="button" onClick={onCancel} className="w-full rounded-full px-4 py-3 font-semibold text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon">
          Don’t upload
        </button>
      </form>
    </Modal>
  )
}
