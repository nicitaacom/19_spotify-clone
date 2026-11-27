type KeyValueStorage = Pick<Storage, "getItem" | "setItem">

export function playlistTagDismissalKey(userId: string, playlistId: string): string {
  return `playlist-tag-dismissals:v1:${userId}:${playlistId}`
}

export function readDismissedPlaylistTags(storage: KeyValueStorage, key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null")
    if (!Array.isArray(value)) return []
    return Array.from(new Set(value.filter((tag): tag is string => typeof tag === "string" && tag.length > 0 && tag.length <= 32)))
  } catch {
    return []
  }
}

export function writeDismissedPlaylistTags(storage: KeyValueStorage, key: string, tags: string[]): void {
  try {
    storage.setItem(key, JSON.stringify(Array.from(new Set(tags))))
  } catch {
    // Browser storage can be unavailable; the current modal still keeps its in-memory exclusions.
  }
}
