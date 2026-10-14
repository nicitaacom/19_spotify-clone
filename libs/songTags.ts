import { normalizeTagList, tagGroups, inferPlaylistGenreTags } from "../config/music-tags.mjs"
export { inferPlaylistGenreTags }
export const MAX_SONG_TAGS = 32
export const MAX_MUSIC_QUERY_TAGS = 32
export const MAX_SONG_TAG_LENGTH = 32
export const SONG_TAG_SUGGESTIONS = Array.from(new Set(["sad", "happy", "energy", "slow", "fast", ...Object.values(tagGroups).flat()]))

export function normalizeSongTags(value: unknown): string[] {
  return normalizeTagList(value, MAX_SONG_TAGS)
}
export function parseSongTags(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === "string") {
    try { value = JSON.parse(value) }
    catch { throw new Error("Tags must be a list of text labels.") }
  }
  return normalizeSongTags(value)
}
export function songTagsWithDraft(tags: string[], draft: string): string[] {
  return normalizeSongTags([...tags, ...draft.split(",").filter(tag => tag.trim())])
}
