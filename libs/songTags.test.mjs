import test from "node:test"
import assert from "node:assert/strict"
import { filterDismissedPlaylistTags, matchedSongTags, normalizeSongTags, parseSongTags, recentPlaylistTags, removedPlaylistTags, songTagSearchValues, songTagsWithDraft } from "./songTags.ts"

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
test("playlist tags fill the labels shared by its songs", () => {
  const result = recentPlaylistTags([
    { addedAt: "2026-10-03T00:00:00.000Z", tags: ["motivation", "film", "epic", "one-off"] },
    { addedAt: "2026-10-02T00:00:00.000Z", tags: ["motivation", "film", "epic"] },
    { addedAt: "2026-10-01T00:00:00.000Z", tags: ["motivation", "sad"] },
  ])
  assert.deepEqual(result.autofill, ["motivation", "film"])
  assert.deepEqual(result.top, ["motivation", "film"])
})

test("playlist popularity includes songs older than the latest eight", () => {
  const result = recentPlaylistTags([
    { addedAt: "2026-10-10T00:00:00.000Z", tags: ["newest"] },
    { addedAt: "2026-10-09T00:00:00.000Z", tags: ["second"] },
    { addedAt: "2026-10-08T00:00:00.000Z", tags: ["third"] },
    { addedAt: "2026-10-07T00:00:00.000Z", tags: ["fourth"] },
    { addedAt: "2026-10-06T00:00:00.000Z", tags: ["fifth"] },
    { addedAt: "2026-10-05T00:00:00.000Z", tags: ["sixth"] },
    { addedAt: "2026-10-04T00:00:00.000Z", tags: ["seventh"] },
    { addedAt: "2026-10-03T00:00:00.000Z", tags: ["eighth"] },
    { addedAt: "2026-10-02T00:00:00.000Z", tags: ["chill"] },
    { addedAt: "2026-10-01T00:00:00.000Z", tags: ["chill"] },
    { addedAt: "2026-09-30T00:00:00.000Z", tags: ["chill"] },
  ])
  assert.deepEqual(result.top, ["chill", "newest"])
  assert.deepEqual(result.autofill, ["chill"])
})

test("a removed playlist tag stays out of both suggestions and autofill after upload", () => {
  const removed = removedPlaylistTags(["chill", "focus"], ["focus"], ["chill", "focus"])
  assert.deepEqual(removed, ["chill"])

  // Upload success clears the form and recalculates suggestions from the playlist.
  // The removed tag must stay excluded from both lists after that reset.
  assert.deepEqual(filterDismissedPlaylistTags(["chill", "focus"], removed), ["focus"])
  assert.deepEqual(filterDismissedPlaylistTags(["chill"], removed), [])
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

test("search highlights the tag that matched, including an alias", () => {
  assert.deepEqual(songTagSearchValues(" lo-fi "), ["lofi", "lo-fi"])
  assert.deepEqual(songTagSearchValues("fast"), ["fast"])
  assert.deepEqual(matchedSongTags(["russian", "fast", "energy"], "fast"), ["fast"])
  assert.deepEqual(matchedSongTags(["hip-hop", "vibe"], "hip hop"), ["hip-hop"])
  assert.deepEqual(matchedSongTags(["быстрая", "energy"], "быстр"), ["быстрая"])
  assert.deepEqual(matchedSongTags(["sad", "a", "car", "ambient"], "a"), ["a"])
  assert.deepEqual(matchedSongTags([], "fast"), [])
})

test("the last typed tag is saved without requiring Enter, including when all badge slots are occupied", () => {
  assert.deepEqual(songTagsWithDraft(["happy"], " Slow, rainy "), ["happy", "slow", "rainy"])
  assert.deepEqual(songTagsWithDraft(Array.from({ length: 32 }, (_, i) => `tag${i}`), ""),
    Array.from({ length: 32 }, (_, i) => `tag${i}`))
  assert.throws(() => songTagsWithDraft(["happy"], "bad<script>"))
})
