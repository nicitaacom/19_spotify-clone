import test from "node:test"
import assert from "node:assert/strict"
import { mergeBilingualTags, modelMessageText, translationsFromModel } from "./bilingualSongTags.mjs"
import { MAX_SONG_TAGS, normalizeSongTags } from "./songTags.ts"

const acceptTag = item => {
  try { return normalizeSongTags([item])[0] ?? "" } catch { return "" }
}

test("model pairs keep a translation only when the alphabet changes", () => {
  const tags = ["visualization", "жоско", "hard"]
  assert.deepEqual(translationsFromModel({
    pairs: [
      { tag: "visualization", translation: "визуализация" },
      { tag: "hard", translation: "hardcore" },
      { tag: "жоско", translation: "hard" },
      { tag: "missing", translation: "вайб" },
      { tag: "visualization", translation: 2 },
    ],
  }, tags), ["визуализация", "hard"])
  assert.deepEqual(translationsFromModel({}, tags), [])
  assert.deepEqual(translationsFromModel(null, tags), [])
})

test("merged tags keep the originals and drop duplicates and invalid text", () => {
  assert.deepEqual(
    mergeBilingualTags(["visualization", "hard"], ["визуализация", "hard", "<script>", "жестко"], acceptTag, MAX_SONG_TAGS),
    ["visualization", "hard", "визуализация", "жестко"],
  )
})

test("a full tag list does not grow past 32", () => {
  const tags = Array.from({ length: 32 }, (_, index) => `tag${index}`)
  assert.deepEqual(mergeBilingualTags(tags, ["ещё"], acceptTag, MAX_SONG_TAGS), tags)
})

test("a message can be a string or a list of text parts", () => {
  assert.equal(modelMessageText('{"add":["vibe"]}'), '{"add":["vibe"]}')
  assert.equal(modelMessageText([{ text: '{"add":' }, { text: '["вайб"]}' }]), '{"add":["вайб"]}')
  assert.equal(modelMessageText(null), "")
})
