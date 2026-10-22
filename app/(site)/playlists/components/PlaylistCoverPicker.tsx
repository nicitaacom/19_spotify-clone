"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

const PlaylistCoverPicker = ({ playlistId }: { playlistId: string }) => {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const uploadCover = async () => {
    const file = inputRef.current?.files?.[0]
    if (inputRef.current) inputRef.current.value = ""
    if (!file) return
    setBusy(true)
    setErrorMessage("")
    try {
      const body = new FormData()
      body.append("image", file)
      const response = await fetch(`/api/playlists/${playlistId}/cover`, { method: "POST", body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const reason = typeof payload.error === "string" ? payload.error : `${response.status} ${response.statusText}`
        throw new Error(reason)
      }
      router.refresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? `${error.name}: ${error.message}` : "Error: Unknown error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="absolute inset-0 flex items-end justify-center bg-black/45 pb-2 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-100">
        {busy ? "Updating cover…" : "Change cover"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
        className="hidden"
        onChange={() => uploadCover()}
      />
      {errorMessage && (
        <p role="alert" className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-200">
          {errorMessage}
        </p>
      )}
    </>
  )
}

export default PlaylistCoverPicker
