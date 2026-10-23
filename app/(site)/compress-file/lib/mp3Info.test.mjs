import assert from "node:assert/strict"
import test from "node:test"

import { id3AudioStart, pcmBytes, readFrameHeader, readMp3Info } from "./mp3Info.ts"

test("id3 header size points at the first audio byte", () => {
  const bytes = new Uint8Array(20)
  bytes.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 10])
  assert.equal(id3AudioStart(bytes), 20)
})

test("a 128 kbps frame reports its own size", () => {
  const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00])
  const header = readFrameHeader(bytes, 0)
  assert.equal(header.bitrateBps, 128000)
  assert.equal(header.sampleRate, 44100)
  assert.equal(header.channels, 2)
  assert.equal(header.frameBytes, 417)
})

test("duration follows file size when the frame header has no Xing count", () => {
  const frame = new Uint8Array(417)
  frame.set([0xff, 0xfb, 0x90, 0x00])
  const info = readMp3Info(frame, 417 * 10)
  assert.equal(info.bitrateBps, 128000)
  assert.equal(info.durationSec, (417 * 10 * 8) / 128000)
  assert.ok(pcmBytes(info.durationSec, info.sampleRate, info.channels) > 0)
})
