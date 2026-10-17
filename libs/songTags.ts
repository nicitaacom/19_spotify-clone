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

const RECENT_PLAYLIST_SONGS = 8
const PLAYLIST_TAG_AUTOFILL_LIMIT = 12

export type RecentPlaylistSong = { addedAt: string; tags: string[] }

/** Tags shared by the songs most recently added to one playlist, plus every tag from that window. */
export function recentPlaylistTags(entries: RecentPlaylistSong[]): { autofill: string[]; recent: string[] } {
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
  const sharedCount = songs.length <= 1 ? 1 : Math.max(2, Math.ceil(songs.length / 2))
  return {
    autofill: ranked.filter(([, stat]) => stat.count >= sharedCount).map(([tag]) => tag).slice(0, PLAYLIST_TAG_AUTOFILL_LIMIT),
    recent: ranked.map(([tag]) => tag),
  }
}
