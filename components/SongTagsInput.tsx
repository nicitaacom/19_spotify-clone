"use client"
import { useState } from "react"
import { FiPlus, FiX } from "react-icons/fi"
import { normalizeSongTags, MAX_SONG_TAGS, MAX_SONG_TAG_LENGTH, SONG_TAG_SUGGESTIONS } from "@/libs/songTags"

export function SongTagsInput({ value, onChange, disabled = false, id = "song-tags" }: {
  value: string[]; onChange: (tags: string[]) => void; disabled?: boolean; id?: string
}) {
  const [draft, setDraft] = useState(""), [error, setError] = useState("")
  const add = (candidate = draft) => {
    if (!candidate.trim() || disabled) return
    try {
      onChange(normalizeSongTags([...value, ...candidate.split(",")]))
      if (candidate === draft) setDraft("")
      setError("")
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to add tag.") }
  }
  const remove = (tag: string) => { onChange(value.filter(item => item !== tag)); setError("") }
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm text-neutral-300">Tags (optional)</label>
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-white/15 bg-elevated px-3 py-2 focus-within:border-neon">
        {value.map(tag => (
          <span key={tag} className="inline-flex max-w-full items-center gap-1 rounded-full border border-neon/30 bg-neon/10 py-1 pl-3 pr-1 text-xs text-neon">
            <span className="break-words">{tag}</span>
            <button type="button" disabled={disabled} aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-neon/20 disabled:opacity-50"><FiX size={13} /></button>
          </span>
        ))}
        <div className="flex min-w-0 flex-1 basis-full items-center gap-2">
        <input id={id} name="songTagDraft" data-song-tags-input value={draft} disabled={disabled || value.length >= MAX_SONG_TAGS}
          placeholder="e.g. sad, happy, energy, slow, fast" maxLength={MAX_SONG_TAG_LENGTH * MAX_SONG_TAGS}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={Boolean(error)}
          onChange={event => { setDraft(event.target.value); setError("") }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Enter" || event.key === ",") { event.preventDefault(); event.stopPropagation(); add() }
            else if (event.key === "Backspace" && !draft && value.length) { event.preventDefault(); remove(value[value.length - 1]) }
          }}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-neutral-500 disabled:opacity-50" />
        <button type="button" disabled={disabled || !draft.trim() || value.length >= MAX_SONG_TAGS}
          onClick={() => add()} aria-label="Add tag" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neon hover:bg-neon/10 disabled:opacity-40"><FiPlus size={16} /></button>
        </div>
      </div>
      <p id={`${id}-help`} className="text-xs text-neutral-400">Press Enter or comma to add a tag. {value.length}/{MAX_SONG_TAGS}</p>
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-1.5" aria-label="Suggested tags">
        {SONG_TAG_SUGGESTIONS.filter(tag => !value.includes(tag)).slice(0, 8).map(tag => (
          <button key={tag} type="button" disabled={disabled || value.length >= MAX_SONG_TAGS} onClick={() => add(tag)}
            className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-neutral-400 hover:border-neon/40 hover:text-neon disabled:opacity-40">+ {tag}</button>
        ))}
      </div>
    </div>
  )
}
