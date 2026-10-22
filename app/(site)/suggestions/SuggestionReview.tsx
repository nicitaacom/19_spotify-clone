"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type SuggestionCard = {
  id: number
  title: string | null
  author: string | null
  tags: string[] | null
  song: { title: string | null; author: string | null; tags: string[] | null }
}

const field = (label: string, current: string, suggested: string | null) => (
  <p className="text-sm text-neutral-300">
    <span className="text-neutral-500">{label}: </span>
    {current || "—"}
    {suggested ? <span className="text-neon"> → {suggested}</span> : null}
  </p>
)

const SuggestionReview = ({ suggestions }: { suggestions: SuggestionCard[] }) => {
  const router = useRouter()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  const review = async (id: number, action: "approve" | "reject") => {
    setBusyId(id)
    setErrorMessage("")
    try {
      const response = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `${response.status} ${response.statusText}`)
      router.refresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? `${error.name}: ${error.message}` : "Error: Unknown error")
    } finally {
      setBusyId(null)
    }
  }

  if (!suggestions.length) return <p className="px-6 py-8 text-sm text-neutral-400">No suggestions are waiting.</p>

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      {errorMessage && <p role="alert" className="text-sm text-red-300">{errorMessage}</p>}
      {suggestions.map(suggestion => (
        <article key={suggestion.id} className="rounded-xl border border-white/10 bg-elevated p-4">
          {field("Title", suggestion.song.title ?? "", suggestion.title)}
          {field("Author", suggestion.song.author ?? "", suggestion.author)}
          {field("Tags", (suggestion.song.tags ?? []).join(", "), suggestion.tags?.join(", ") ?? null)}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busyId === suggestion.id} onClick={() => review(suggestion.id, "approve")} className="rounded-md bg-neon px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50">Approve</button>
            <button type="button" disabled={busyId === suggestion.id} onClick={() => review(suggestion.id, "reject")} className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-neutral-200 disabled:opacity-50">Reject</button>
          </div>
        </article>
      ))}
    </div>
  )
}

export default SuggestionReview
