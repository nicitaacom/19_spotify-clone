export const MAX_SONG_TAGS = 12
export const MAX_SONG_TAG_LENGTH = 32
export const SONG_TAG_SUGGESTIONS = ["sad", "happy", "energy", "slow", "fast", "calm", "cozy", "ambient", "rainy", "sunny", "night", "winter"]

export function normalizeSongTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_SONG_TAGS) throw new Error(`Use up to ${MAX_SONG_TAGS} tags.`)
  const tags: string[] = []
  for (const item of value) {
    if (typeof item !== "string") throw new Error("Each tag must be text.")
    const tag = item.trim().normalize("NFC").toLowerCase().replace(/\s+/g, " ")
    if (!tag) continue
    if (tag.length > MAX_SONG_TAG_LENGTH || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(tag))
      throw new Error(`Tags can use letters, numbers, spaces, hyphens, and underscores, up to ${MAX_SONG_TAG_LENGTH} characters.`)
    if (!tags.includes(tag)) tags.push(tag)
  }
  return tags
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
