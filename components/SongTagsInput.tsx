"use client"
import { useRef, useState } from "react"
import { FiChevronRight, FiPlus, FiX } from "react-icons/fi"
import { normalizeSongTags, MAX_SONG_TAGS, MAX_SONG_TAG_LENGTH, SONG_TAG_SUGGESTIONS } from "@/libs/songTags"

export function SongTagsInput({ value, onChange, disabled = false, id = "song-tags" }: {
  value: string[]; onChange: (tags: string[]) => void; disabled?: boolean; id?: string
}) {
  const [draft, setDraft] = useState(""), [error, setError] = useState("")
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const suggestions = SONG_TAG_SUGGESTIONS.filter(tag => !value.includes(tag))

  const showMoreSuggestions = () => {
    const suggestionsElement = suggestionsRef.current
    if (!suggestionsElement) return

    const isAtEnd = suggestionsElement.scrollLeft + suggestionsElement.clientWidth >= suggestionsElement.scrollWidth - 1
    suggestionsElement.scrollBy({
      left: isAtEnd ? -suggestionsElement.scrollLeft : Math.max(120, suggestionsElement.clientWidth * 0.75),
      behavior: "smooth",
    })
  }

  const add = (candidate = draft) => {
    if (!candidate.trim() || disabled) return
    try {
      onChange(normalizeSongTags([...value, ...candidate.split(",")]))
      if (candidate === draft) setDraft("")
      setError("")
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Unable to add tag.") }
  }
  const remove = (tag: string) => { onChange(value.filter(item => item !== tag)); setError("") }

  const handleSuggestionsPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    }
  }
  const handleSuggestionsPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const distance = event.clientX - drag.startX
    if (Math.abs(distance) > 3) {
      drag.moved = true
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId)
    }
    if (!drag.moved) return
    event.currentTarget.scrollLeft = drag.startScrollLeft - distance
  }
  const finishSuggestionsDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressClickRef.current = drag.moved
    dragRef.current = null
  }
  const handleSuggestionsClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm text-neutral-300">Tags (image that comes with music)</label>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-white/10 bg-elevated px-2 py-1.5 focus-within:border-neon/50 focus-within:ring-1 focus-within:ring-neon/30">
        {value.map(tag => (
          <span key={tag} className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-neon/30 bg-neon/10 py-0.5 pl-2 pr-0.5 text-[11px] text-neon">
            <span className="min-w-0 break-words">{tag}</span>
            <button type="button" disabled={disabled} aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)}
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-neon/20 disabled:opacity-50"><FiX size={12} /></button>
          </span>
        ))}
        <input id={id} name="songTagDraft" data-song-tags-input value={draft} disabled={disabled || value.length >= MAX_SONG_TAGS}
          size={1}
          placeholder={value.length ? "Add a tag" : "e.g. sad, happy, energy, slow, fast"} maxLength={MAX_SONG_TAG_LENGTH * MAX_SONG_TAGS}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} aria-invalid={Boolean(error)}
          onChange={event => { setDraft(event.target.value); setError("") }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Enter" || event.key === ",") { event.preventDefault(); event.stopPropagation(); add() }
            else if (event.key === "Backspace" && !draft && value.length) { event.preventDefault(); remove(value[value.length - 1]) }
          }}
          className="w-0 min-w-[7rem] flex-1 border-0 bg-transparent py-1.5 text-sm text-white outline-none placeholder:text-neutral-500 disabled:opacity-50" />
        <button type="button" disabled={disabled || !draft.trim() || value.length >= MAX_SONG_TAGS}
          onClick={() => add()} aria-label="Add tag" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neon hover:bg-neon/10 disabled:opacity-40"><FiPlus size={16} /></button>
      </div>
      <p id={`${id}-help`} className="text-xs text-neutral-400">Press Enter or comma to add a tag. {value.length}/{MAX_SONG_TAGS}</p>
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-300">{error}</p>}
      <div role="group" aria-label="Suggested tags" className="min-w-0">
        <div className="relative min-w-0">
          <div
            ref={suggestionsRef}
            onPointerDown={handleSuggestionsPointerDown}
            onPointerMove={handleSuggestionsPointerMove}
            onPointerUp={finishSuggestionsDrag}
            onPointerCancel={finishSuggestionsDrag}
            onClickCapture={handleSuggestionsClickCapture}
            className="flex min-h-8 min-w-0 cursor-grab touch-pan-y select-none items-center gap-1.5 overflow-x-auto whitespace-nowrap pr-8 active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map(tag => (
              <button key={tag} type="button" disabled={disabled || value.length >= MAX_SONG_TAGS} onClick={() => add(tag)}
                className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-neutral-400 hover:border-neon/40 hover:text-neon disabled:opacity-40">+ {tag}</button>
            ))}
          </div>
          {suggestions.length > 0 && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-surface to-transparent"
              />
              <button
                type="button"
                aria-label="Show more suggested tags"
                onClick={showMoreSuggestions}
                className="absolute right-0 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-surface text-neutral-300 transition hover:text-neon">
                <FiChevronRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
