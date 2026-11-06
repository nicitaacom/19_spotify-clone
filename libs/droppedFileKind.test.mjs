import test from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./imageFiles") {
      return nextResolve(new URL("./imageFiles.ts", context.parentURL).href, context)
    }
    return nextResolve(specifier, context)
  },
})

const { SONG_FILE_ACCEPT, coverTypeToStamp, droppedFileKind, isSongFile, songInputError, splitDroppedFiles } = await import("./droppedFileKind.ts")

test("audio names and audio types go to the song input", () => {
  assert.equal(droppedFileKind("Interstellar.mp3", ""), "song")
  assert.equal(droppedFileKind("Interstellar.MP3", "audio/mpeg"), "song")
  assert.equal(droppedFileKind("room.wav", ""), "song")
  assert.equal(droppedFileKind("room.flac", "application/octet-stream"), "song")
  assert.equal(droppedFileKind("voice.m4a", "audio/mp4"), "song")
  assert.equal(droppedFileKind("clip.webm", ""), "song")
  assert.equal(droppedFileKind("movie.mp4", "audio/mp4"), null)
  assert.equal(isSongFile("показать.jpg", "image/jpeg"), false)
  assert.equal(isSongFile("показать.jpg", ""), false)
  assert.equal(isSongFile("показать.jpg", "audio/mpeg"), false)
  assert.equal(droppedFileKind("показать.jpg", "image/jpeg"), "image")
  assert.match(songInputError("показать.jpg", "image/jpeg"), /image/)
  assert.equal(songInputError("room.wav", ""), "")
  assert.equal(SONG_FILE_ACCEPT.includes(".mp3"), true)
  assert.equal(SONG_FILE_ACCEPT.includes("jpg"), false)
  assert.equal(SONG_FILE_ACCEPT.includes("image/"), false)
})

test("cover names go to the image input, including an empty type", () => {
  assert.equal(droppedFileKind("cover.jpg", ""), "image")
  assert.equal(droppedFileKind("cover.JPEG", ""), "image")
  assert.equal(droppedFileKind("cover.png", "image/png"), "image")
  assert.equal(droppedFileKind("cover.webp", "application/octet-stream"), "image")
  assert.equal(droppedFileKind("cover.avif", "image/avif"), "image")
  assert.equal(coverTypeToStamp("cover.jpg", ""), "image/jpeg")
  assert.equal(coverTypeToStamp("cover.png", "application/octet-stream"), "image/png")
  assert.equal(coverTypeToStamp("cover.jpg", "image/jpeg"), "")
})

test("a video, a mismatched cover, and other files stay out", () => {
  assert.equal(droppedFileKind("clip.webm", "video/webm"), null)
  assert.equal(droppedFileKind("movie.mp4", "video/mp4"), null)
  assert.equal(droppedFileKind("cover.jpg", "image/png"), null)
  assert.equal(droppedFileKind("cover.jpg", "audio/mpeg"), null)
  assert.equal(droppedFileKind("photo.gif", "image/gif"), null)
  assert.equal(droppedFileKind("notes.txt", "text/plain"), null)
  assert.equal(droppedFileKind("song.waw", ""), null)
  assert.equal(coverTypeToStamp("notes.txt", ""), "")
})

test("one drop keeps the last song and the last cover", () => {
  const split = splitDroppedFiles([
    { name: "first.mp3", type: "" },
    { name: "notes.txt", type: "text/plain" },
    { name: "cover.png", type: "" },
    { name: "second.wav", type: "audio/wav" },
    { name: "other.webp", type: "image/webp" },
  ])
  assert.equal(split.song?.name, "second.wav")
  assert.equal(split.image?.name, "other.webp")
  assert.deepEqual(split.skipped.map(file => file.name), ["notes.txt"])
})
