import assert from "node:assert/strict"
import test from "node:test"
import { playlistTagDismissalKey, readDismissedPlaylistTags, writeDismissedPlaylistTags } from "./playlistTagDismissals.ts"

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test("removed tags persist across modal sessions for the same user and playlist", () => {
  const storage = memoryStorage()
  const key = playlistTagDismissalKey("user-1", "playlist-1")
  writeDismissedPlaylistTags(storage, key, ["chill", "focus", "chill"])

  // A new modal session reads the same account and playlist preference.
  assert.deepEqual(readDismissedPlaylistTags(storage, playlistTagDismissalKey("user-1", "playlist-1")), ["chill", "focus"])
  assert.deepEqual(readDismissedPlaylistTags(storage, playlistTagDismissalKey("user-1", "playlist-2")), [])
  assert.deepEqual(readDismissedPlaylistTags(storage, playlistTagDismissalKey("user-2", "playlist-1")), [])
})

test("invalid saved dismissal data is ignored", () => {
  const storage = memoryStorage()
  storage.setItem("broken", "not json")
  assert.deepEqual(readDismissedPlaylistTags(storage, "broken"), [])
})
