import assert from "node:assert/strict"
import test from "node:test"
import { Mp3Encoder } from "@breezystack/lamejs"
import { parseBuffer } from "music-metadata"

import { buildId3Tag } from "../app/(site)/slow-and-reverb/lib/id3Writer.ts"
import { getMp3AudioBytes, getSongDownloadFilename } from "./mp3Tags.ts"

const encoder = new Mp3Encoder(1, 44100, 128)
const audioBytes = Buffer.concat([Buffer.from(encoder.encodeBuffer(new Int16Array(44100))), Buffer.from(encoder.flush())])
const coverBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRX8AAAAASUVORK5CYII=", "base64")
const metadata = {
  title: "RIP — 音楽 🎵",
  artist: "Neoni",
  album: "Neoni playlist",
  albumArtist: "Various Artists",
  year: 2024,
  genre: "Pop",
  trackNumber: 2,
  trackTotal: 11,
  artData: coverBytes,
  artMime: "image/png",
}

test("replaces old ID3v2 and ID3v1 tags, preserving MP3 audio and readable Unicode metadata and cover art", async () => {
  const previousTag = buildId3Tag({ ...metadata, title: "Old title", artist: "Old artist" })
  const id3v1 = Buffer.alloc(128)
  id3v1.write("TAGOld title")
  const audio = getMp3AudioBytes(Buffer.concat([previousTag, audioBytes, id3v1]))
  assert.deepEqual(Buffer.from(audio), audioBytes)

  const result = await parseBuffer(Buffer.concat([buildId3Tag(metadata), audio]), "audio/mpeg")
  assert.equal(result.format.codec, "MPEG 1 Layer 3")
  assert.equal(result.common.title, metadata.title)
  assert.equal(result.common.artist, metadata.artist)
  assert.equal(result.common.album, metadata.album)
  assert.equal(result.common.albumartist, metadata.albumArtist)
  assert.equal(result.common.year, metadata.year)
  assert.deepEqual(result.common.genre, [metadata.genre])
  assert.deepEqual(result.common.track, { no: metadata.trackNumber, of: metadata.trackTotal })
  assert.equal(result.common.picture[0].format, "image/png")
  assert.deepEqual(Buffer.from(result.common.picture[0].data), coverBytes)
})

test("handles ID3v2.2, v2.4 footers, and multiple leading tags without removing audio frames", () => {
  const version2 = Buffer.from([0x49, 0x44, 0x33, 2, 0, 0, 0, 0, 0, 0])
  const version4 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0x10, 0, 0, 0, 0])
  const footer = Buffer.from([0x33, 0x44, 0x49, 4, 0, 0x10, 0, 0, 0, 0])
  assert.deepEqual(Buffer.from(getMp3AudioBytes(Buffer.concat([version2, version4, footer, audioBytes]))), audioBytes)
  assert.deepEqual(Buffer.from(getMp3AudioBytes(audioBytes)), audioBytes)
})

test("rejects invalid or truncated ID3 headers and files with no audio", () => {
  assert.throws(() => getMp3AudioBytes(new Uint8Array()), /no audio data/)
  assert.throws(() => getMp3AudioBytes(Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 12])), /incomplete ID3 tag/)
  assert.throws(() => getMp3AudioBytes(Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0x80, 0, 0, 0])), /invalid ID3 header/)
  assert.throws(() => getMp3AudioBytes(buildId3Tag(metadata)), /no audio data/)
})

test("creates safe MP3 filenames while retaining Unicode song names", () => {
  assert.equal(getSongDownloadFilename("Artist/Name", 'Title: "音楽"?'), "Artist_Name - Title_ _音楽__.mp3")
  assert.equal(getSongDownloadFilename("Neoni", "RIP\u0000\n"), "Neoni - RIP.mp3")
  assert.equal(getSongDownloadFilename("Neoni", "RIP... "), "Neoni - RIP.mp3")
  assert.ok(getSongDownloadFilename("Artist", "A".repeat(300)).length <= 184)
})
