import { mergeBilingualTags as mergeRaw } from "./bilingualSongTags.mjs"
import { MAX_SONG_TAGS, normalizeSongTags } from "./songTags"

function acceptTag(item: string): string {
  try { return normalizeSongTags([item])[0] ?? "" } catch { return "" }
}

export function mergeBilingualTags(tags: string[], added: string[]): string[] {
  return mergeRaw(tags, added, acceptTag, MAX_SONG_TAGS) as string[]
}
