import test from "node:test"
import assert from "node:assert/strict"
import { normalizeSongTags, parseSongTags, songTagsWithDraft } from "./songTags.ts"

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
test("the last typed tag is saved without requiring Enter, including when all badge slots are occupied", () => {
  assert.deepEqual(songTagsWithDraft(["happy"], " Slow, rainy "), ["happy", "slow", "rainy"])
  assert.deepEqual(songTagsWithDraft(Array.from({ length: 32 }, (_, i) => `tag${i}`), ""),
    Array.from({ length: 32 }, (_, i) => `tag${i}`))
  assert.throws(() => songTagsWithDraft(["happy"], "bad<script>"))
})
