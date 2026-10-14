import { normalizeSongTags } from "./songTags"

export interface MusicRecommendation {
  id: string
  title: string
  author: string
  coverUrl: string | null
  href: string
  tags: string[]
  matchedTags: string[]
}
export function recommendationQuery(parameters: URLSearchParams) {
  const raw = parameters.get("tags") ?? ""
  if (raw.length > 400) throw new Error("Too many tags.")
  const tags = normalizeSongTags(raw.split(",").filter(tag => tag.trim()))
  const requested = parameters.get("limit") ?? "6"
  if (!/^\d{1,2}$/.test(requested) || Number(requested) < 1 || Number(requested) > 12) throw new Error("Use a limit between 1 and 12.")
  return { tags, limit: Number(requested) }
}
