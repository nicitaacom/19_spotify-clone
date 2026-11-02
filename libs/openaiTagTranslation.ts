import { mergeBilingualTags } from "./bilingualSongTags"
import { requestTagTranslations } from "./openaiTagTranslation.mjs"
import { normalizeSongTags } from "./songTags"

export async function bilingualSongTags(tags: string[]): Promise<string[]> {
  const current = normalizeSongTags(tags)
  if (current.length === 0) return []
  return mergeBilingualTags(current, await requestTagTranslations(current) as string[])
}
