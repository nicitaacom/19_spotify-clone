import { httpErrorMessage } from "@/libs/errorText"
import { normalizeSongTags } from "@/libs/songTags"

export async function fetchBilingualSongTags(tags: string[]): Promise<string[]> {
  if (tags.length === 0) return []
  const response = await fetch("/api/songs/tag-translations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  })
  const bodyText = await response.text()
  if (!response.ok) {
    throw new Error(httpErrorMessage({
      action: "Translate song tags",
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      bodyText,
      contentType: response.headers.get("content-type") ?? "",
    }))
  }
  const body = JSON.parse(bodyText) as { tags?: unknown }
  return normalizeSongTags(body.tags)
}
