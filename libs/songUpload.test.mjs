import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { registerHooks } from "node:module"
import test from "node:test"
import { Mp3Encoder } from "@breezystack/lamejs"
import { parseBlob } from "music-metadata"

import { MAX_SONG_UPLOAD_BYTES, prepareSongUpload, uploadBitrateKbps } from "./songUpload.ts"

// Resolve the Next.js alias and extensionless import when running directly in Node.
const encoderUrl = new URL("../app/(site)/slow-and-reverb/lib/encodeMp3.ts", import.meta.url)
const transcodeUrl = new URL("../app/(site)/compress-file/lib/transcodeMp3.ts", import.meta.url)
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/app/(site)/slow-and-reverb/lib/encodeMp3") {
      return nextResolve(encoderUrl.href, context)
    }
    if (specifier === "@/app/(site)/compress-file/lib/transcodeMp3") {
      return nextResolve(transcodeUrl.href, context)
    }
    if (specifier.endsWith("id3Writer") && (context.parentURL === encoderUrl.href || context.parentURL === transcodeUrl.href)) {
      return nextResolve(new URL("./id3Writer.ts", encoderUrl).href, context)
    }
    if (context.parentURL === transcodeUrl.href && specifier.startsWith("./")) {
      return nextResolve(new URL(`${specifier}.ts`, transcodeUrl).href, context)
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
  const sizes = []
  const result = await prepareSongUpload(source, 1, undefined, (fromBytes, toBytes) => sizes.push([fromBytes, toBytes]))
  assert.ok(result.size < MAX_SONG_UPLOAD_BYTES)
  // 320 kbps over the cap keeps 256, the highest step under 49 MiB - not 128
  assert.equal((await parseBlob(result)).format.bitrate, 256000)
  assert.deepEqual(sizes, [[source.size, source.size * 256 / 320]])
})

test("a two hour recording is stored below 128 kbps so it fits in 50 MB", () => {
  assert.equal(uploadBitrateKbps(60), 128)
  assert.equal(uploadBitrateKbps(3600), 112)
  assert.equal(uploadBitrateKbps(8112), 48)
  assert.equal(uploadBitrateKbps(3 * 3600), 32)
})

test("keeps a small 128 kbps mp3 when the bytes already fit, even if the duration argument is long", async t => {
  const decode = mockDecoder(t)
  const source = mp3File(128)
  const result = await prepareSongUpload(source, 8112)
  assert.equal(decode.mock.callCount(), 0)
  assert.equal(result, source)
  assert.equal((await parseBlob(result)).format.bitrate, 128000)
})

test("a file just over the cap drops one bitrate step, not down to half", () => {
  const bytes = 52 * 1024 * 1024
  assert.equal(uploadBitrateKbps(bytes * 8 / 128000, bytes, 128000), 112)
  assert.equal(uploadBitrateKbps(bytes * 8 / 64000, bytes, 64000), 56)
  // above 128 too: 52 MiB at 256 is about 45.5 MiB at 224, not 26 MiB at 128
  assert.equal(uploadBitrateKbps(bytes * 8 / 256000, bytes, 256000), 224)
  assert.equal(uploadBitrateKbps(bytes * 8 / 320000, bytes, 320000), 256)
  const underCap = 40 * 1024 * 1024
  assert.equal(uploadBitrateKbps(underCap * 8 / 128000, underCap, 128000), 128)
})

test("reports unreadable audio and invalid duration instead of uploading the original M4A", async t => {
  mockDecoder(t, async () => { throw new Error("EncodingError") })
  const source = new File([m4aBytes], "broken.m4a")
  await assert.rejects(prepareSongUpload(source, 1), /Could not convert "broken\.m4a"\. Error: EncodingError/)
  for (const duration of [0, -1, NaN, Infinity]) {
    await assert.rejects(prepareSongUpload(source, duration), /Could not determine the duration of "broken\.m4a"/)
  }
  await assert.rejects(prepareSongUpload(new File([m4aBytes], "cover.jpg", { type: "image/jpeg" }), 1), /cover\.jpg" is not an audio file/)
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
