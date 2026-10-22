import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { registerHooks } from "node:module"
import test from "node:test"
import { Mp3Encoder } from "@breezystack/lamejs"
import { parseBlob } from "music-metadata"

import { MAX_SONG_UPLOAD_BYTES, prepareSongUpload } from "./songUpload.ts"

// Resolve the Next.js alias and extensionless import when running directly in Node.
const encoderUrl = new URL("../app/(site)/slow-and-reverb/lib/encodeMp3.ts", import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/app/(site)/slow-and-reverb/lib/encodeMp3") {
      return nextResolve(encoderUrl.href, context)
    }
    if (specifier === "./id3Writer" && context.parentURL === encoderUrl.href) {
      return nextResolve(new URL("./id3Writer.ts", encoderUrl).href, context)
    }
    return nextResolve(specifier, context)
  },
})
const { encodeMp3 } = await import(encoderUrl.href)
const m4aBytes = await readFile(new URL("../tests/fixtures/song-upload.m4a", import.meta.url))
const samples = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i * 2 * Math.PI * 440 / 44100) * 0.5)
const audioBuffer = {
  sampleRate: 44100,
  numberOfChannels: 2,
  getChannelData: () => samples,
}

function mockDecoder(t, decode = async () => audioBuffer) {
  const previous = globalThis.OfflineAudioContext
  const decodeAudioData = t.mock.fn(decode)
  globalThis.OfflineAudioContext = class {
    decodeAudioData = decodeAudioData
  }
  t.after(() => {
    if (previous) globalThis.OfflineAudioContext = previous
    else delete globalThis.OfflineAudioContext
  })
  return decodeAudioData
}

function mp3File(kbps, type = "audio/mpeg") {
  const encoder = new Mp3Encoder(1, 44100, kbps)
  const pcm = Int16Array.from(samples, value => Math.round(value * 32767))
  return new File([encoder.encodeBuffer(pcm), encoder.flush()], "song.mp3", { type })
}

test("converts an M4A upload to real 128 kbps MP3 frames with the correct extension and MIME type", async t => {
  const decode = mockDecoder(t)
  const progress = []
  const source = new File([m4aBytes], "song.M4A", { type: "audio/x-m4a" })
  const result = await prepareSongUpload(source, 1, value => progress.push(value))
  const metadata = await parseBlob(result)
  assert.equal(result.name, "song.mp3")
  assert.equal(result.type, "audio/mpeg")
  assert.equal(metadata.format.codec, "MPEG 1 Layer 3")
  assert.equal(metadata.format.bitrate, 128000)
  assert.equal(metadata.format.numberOfChannels, 2)
  assert.ok(Math.abs(metadata.format.duration - 1) < 0.1)
  assert.equal(decode.mock.callCount(), 1)
  assert.deepEqual(new Uint8Array(decode.mock.calls[0].arguments[0]), new Uint8Array(m4aBytes))
  assert.equal(progress[0], 0)
  assert.equal(progress.at(-1), 100)
})

test("compresses a 320 kbps MP3 even when the original is below 50 MB", async t => {
  mockDecoder(t)
  const source = mp3File(320)
  const result = await prepareSongUpload(source, 1)
  assert.equal((await parseBlob(result)).format.bitrate, 128000)
  assert.ok(result.size < source.size / 2)
})

test("preserves the bytes of 128 kbps and lower bitrate MP3s without decoding them", async t => {
  const decode = mockDecoder(t)
  for (const kbps of [96, 128]) {
    const source = mp3File(kbps)
    const result = await prepareSongUpload(source, 1)
    assert.equal(result, source)
    assert.deepEqual(await result.arrayBuffer(), await source.arrayBuffer())
  }
  const mislabeled = mp3File(128, "audio/mp3")
  const normalized = await prepareSongUpload(mislabeled, 1)
  assert.equal(normalized.type, "audio/mpeg")
  assert.deepEqual(await normalized.arrayBuffer(), await mislabeled.arrayBuffer())
  assert.equal(decode.mock.callCount(), 0)
})

test("allows an original larger than 50 MB when its compressed result fits", async t => {
  mockDecoder(t)
  const source = new File([mp3File(320), new Uint8Array(MAX_SONG_UPLOAD_BYTES)], "large.mp3", { type: "audio/mpeg" })
  assert.ok(source.size > MAX_SONG_UPLOAD_BYTES)
  const result = await prepareSongUpload(source, 1)
  assert.ok(result.size < MAX_SONG_UPLOAD_BYTES)
  assert.equal((await parseBlob(result)).format.bitrate, 128000)
})

test("rejects a recording that cannot fit at 128 kbps before allocating decoded audio", async t => {
  const decode = mockDecoder(t)
  const source = new File([m4aBytes], "long.m4a")
  await assert.rejects(prepareSongUpload(source, 3600), /still exceeds 50 MB at 128 kbps/)
  assert.equal(decode.mock.callCount(), 0)
})

test("reports unreadable audio and invalid duration instead of uploading the original M4A", async t => {
  mockDecoder(t, async () => { throw new Error("EncodingError") })
  const source = new File([m4aBytes], "broken.m4a")
  await assert.rejects(prepareSongUpload(source, 1), /Could not convert "broken\.m4a"\. Error: EncodingError/)
  for (const duration of [0, -1, NaN, Infinity]) {
    await assert.rejects(prepareSongUpload(source, duration), /Could not determine song duration/)
  }
  await assert.rejects(prepareSongUpload(new File([m4aBytes], "cover.jpg", { type: "image/jpeg" }), 1), /select an audio file/)
})

test("converts a wav upload to an mp3", async t => {
  mockDecoder(t)
  const source = new File([m4aBytes], "song.wav", { type: "audio/wav" })
  const result = await prepareSongUpload(source, 1)
  assert.equal(result.name, "song.mp3")
  assert.equal(result.type, "audio/mpeg")
})

test("keeps existing exports at 320 kbps and retains their metadata", async () => {
  const result = await encodeMp3(audioBuffer, undefined, { title: "Original title", artist: "Artist" })
  const metadata = await parseBlob(result)
  assert.equal(metadata.format.bitrate, 320000)
  assert.equal(metadata.common.title, "Original title")
  assert.equal(metadata.common.artist, "Artist")
})
