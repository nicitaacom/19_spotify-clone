import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { parseSongTags } from "@/libs/songTags"

const sameList = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((tag, index) => tag === sortedRight[index])
}

export type SuggestionInput = { title?: unknown; author?: unknown; tags?: unknown }

export const suggestionChanges = (song: { title: string | null; author: string | null; tags: string[] | null }, input: SuggestionInput) => {
  const title = typeof input.title === "string" ? input.title.trim() : ""
  const author = typeof input.author === "string" ? input.author.trim() : ""
  if (title.length > 200 || author.length > 200) throw new Error("Title and author can be at most 200 characters.")
  const tags = input.tags === undefined || input.tags === null ? null : parseSongTags(input.tags)
  const nextTitle = title && title !== (song.title ?? "") ? title : null
  const nextAuthor = author && author !== (song.author ?? "") ? author : null
  const nextTags = tags && !sameList(tags, song.tags ?? []) ? tags : null
  if (!nextTitle && !nextAuthor && !nextTags) throw new Error("Change the title, author, or tags before sending.")
  return { title: nextTitle, author: nextAuthor, tags: nextTags }
}

export const listPendingSuggestions = async () => {
  const { data, error } = await supabaseAdmin
    .from("19_song_suggestions")
    .select("id, created_at, song_id, title, author, tags")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
  if (error) throw error
  const rows = data ?? []
  const songIds = Array.from(new Set(rows.map(row => row.song_id)))
  const songsById = new Map<number, { title: string | null; author: string | null; tags: string[] | null }>()
  if (songIds.length) {
    const { data: songs, error: songError } = await supabaseAdmin.from("19_songs").select("id, title, author, tags").in("id", songIds)
    if (songError) throw songError
    for (const song of songs ?? []) songsById.set(song.id, song)
  }
  return rows.map(row => ({
    ...row,
    song: songsById.get(row.song_id) ?? { title: null, author: null, tags: null },
  }))
}
