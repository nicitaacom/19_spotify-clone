import { canonicalTag, normalizeTagList, tagGroups, inferPlaylistGenreTags } from "../config/music-tags.mjs"
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

const RECENT_PLAYLIST_SONGS = 8
const TOP_PLAYLIST_TAGS = 2

export type RecentPlaylistSong = { addedAt: string; tags: string[] }

/** The two most used tags on the last 8 songs, and which of those appear on at least two songs. */
export function recentPlaylistTags(entries: RecentPlaylistSong[]): { autofill: string[]; top: string[] } {
  const songs = entries
    .filter(entry => entry.addedAt)
    .sort((earlier, later) => later.addedAt.localeCompare(earlier.addedAt))
    .slice(0, RECENT_PLAYLIST_SONGS)
  const stats = new Map<string, { count: number; newestIndex: number; order: number }>()
  let order = 0

  songs.forEach((song, index) => {
    const seenOnSong = new Set<string>()
    for (const tag of song.tags) {
      if (!tag || seenOnSong.has(tag)) continue
      seenOnSong.add(tag)
      const current = stats.get(tag)
      if (current) current.count += 1
      else stats.set(tag, { count: 1, newestIndex: index, order: order++ })
    }
  })

  const ranked: [string, { count: number; newestIndex: number; order: number }][] = []
  stats.forEach((stat, tag) => ranked.push([tag, stat]))
  ranked.sort((first, second) => {
    if (second[1].count !== first[1].count) return second[1].count - first[1].count
    if (first[1].newestIndex !== second[1].newestIndex) return first[1].newestIndex - second[1].newestIndex
    return first[1].order - second[1].order
  })
  const topRanked = ranked.slice(0, TOP_PLAYLIST_TAGS)
  return {
    top: topRanked.map(([tag]) => tag),
    autofill: topRanked.filter(([, stat]) => stat.count >= 2).map(([tag]) => tag),
  }
}

const MAX_MATCHED_SONG_TAGS = 3

/** Tag values to match in search: the canonical label, plus the typed text when it differs. */
export function songTagSearchValues(query: string): string[] {
  const typed = query.trim().normalize("NFC").toLowerCase()
  if (!typed) return []
  const canonical = canonicalTag(typed)
  return canonical === typed || !canonical ? [typed] : [canonical, typed]
}

/** Tags that explain why a song matched a search query. Exact and alias matches come first. */
export function matchedSongTags(tags: string[] | null | undefined, query: string): string[] {
  const needle = query.trim().normalize("NFC").toLowerCase()
  if (!needle || !tags?.length) return []
  const canonical = canonicalTag(needle)
  const exact: string[] = []
  const partial: string[] = []
  for (const tag of tags) {
    if (!tag) continue
    const value = tag.toLowerCase()
    if (value === needle || value === canonical) exact.push(tag)
    else if (needle.length >= 2 && value.includes(needle)) partial.push(tag)
  }
  return [...exact, ...partial].slice(0, MAX_MATCHED_SONG_TAGS)
}
