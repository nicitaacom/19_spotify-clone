import test from "node:test"
import assert from "node:assert/strict"
import { normalizeSongTags, parseSongTags, recentPlaylistTags, songTagsWithDraft } from "./songTags.ts"

test("song tags survive an API payload with normalized case, Unicode, spacing, and duplicates", () => {
  assert.deepEqual(parseSongTags(JSON.stringify([" HAPPY ", "happy", "lo-fi", " Sa\u0303o  Paulo ", "", "slow"])),
    ["happy", "lofi", "são paulo", "slow"])
  assert.deepEqual(parseSongTags(undefined), [])
  assert.deepEqual(parseSongTags("[]"), [])
})
test("malformed or oversized tags are rejected before song upload or update", () => {
  for (const value of ["happy,slow", '"happy"', '{}', '[null]', '[2]', '["<script>"]', JSON.stringify(["a".repeat(33)]),
    JSON.stringify(Array.from({ length: 33 }, (_, i) => `tag${i}`))]) assert.throws(() => parseSongTags(value))
  assert.deepEqual(normalizeSongTags(Array.from({ length: 32 }, (_, i) => `tag${i}`)),
    Array.from({ length: 32 }, (_, i) => `tag${i}`))
})
test("recent playlist tags fill the labels shared by the latest songs", () => {
  const result = recentPlaylistTags([
    { addedAt: "2026-10-03T00:00:00.000Z", tags: ["motivation", "film", "epic", "one-off"] },
    { addedAt: "2026-10-02T00:00:00.000Z", tags: ["motivation", "film", "epic"] },
    { addedAt: "2026-10-01T00:00:00.000Z", tags: ["motivation", "sad"] },
  ])
  assert.deepEqual(result.autofill, ["motivation", "film"])
  assert.deepEqual(result.top, ["motivation", "film"])
})

test("a playlist with one tagged song does not autofill tags used once", () => {
  const result = recentPlaylistTags([{ addedAt: "2026-10-01T00:00:00.000Z", tags: ["film", "film", "epic"] }])
  assert.deepEqual(result.autofill, [])
  assert.deepEqual(result.top, ["film", "epic"])
})

test("tags used once among several songs stay out of autofill and the row shows two", () => {
  const result = recentPlaylistTags([
    { addedAt: "2026-10-03T00:00:00.000Z", tags: ["epic"] },
    { addedAt: "2026-10-02T00:00:00.000Z", tags: ["film"] },
    { addedAt: "2026-10-01T00:00:00.000Z", tags: ["sad"] },
  ])
  assert.deepEqual(result.autofill, [])
  assert.deepEqual(result.top, ["epic", "film"])
})

test("the last typed tag is saved without requiring Enter, including when all badge slots are occupied", () => {
  assert.deepEqual(songTagsWithDraft(["happy"], " Slow, rainy "), ["happy", "slow", "rainy"])
  assert.deepEqual(songTagsWithDraft(Array.from({ length: 32 }, (_, i) => `tag${i}`), ""),
    Array.from({ length: 32 }, (_, i) => `tag${i}`))
  assert.throws(() => songTagsWithDraft(["happy"], "bad<script>"))
})
