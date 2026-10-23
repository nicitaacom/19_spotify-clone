import assert from "node:assert/strict"
import test from "node:test"

import { bitrateChoices, closestStepIndex, estimateMp3Bytes, formatBytes } from "./bitrate.ts"

const bytesFor = (durationSec, bps) => Math.round((durationSec * bps) / 8)

function choicesFor(sourceBps, durationSec = 180, sampleRate = 44100, extraBytes = 0) {
  return bitrateChoices({
    sourceBps,
    durationSec,
    sourceBytes: bytesFor(durationSec, sourceBps) + extraBytes,
    sampleRate,
  })
}

test("a 128 kbps file starts at 112, even when tags make the file a bit larger", () => {
  const choices = choicesFor(128_000, 180, 44100, 80_000)
  assert.equal(choices.at(-1), 112)
  assert.equal(choices.includes(128), false)
  assert.equal(closestStepIndex(choices), choices.length - 1)
})

test("a 320 kbps file starts at 256", () => {
  assert.equal(choicesFor(320_000).at(-1), 256)
})

test("a 96 kbps file starts at 80", () => {
  assert.equal(choicesFor(96_000).at(-1), 80)
})

test("a file measured just above 48 kbps starts at 40", () => {
  const durationSec = 8112
  const sourceBps = 48000.4
  const sourceBytes = Math.round((durationSec * sourceBps) / 8)
  const choices = bitrateChoices({ sourceBps, durationSec, sourceBytes, sampleRate: 44100 })
  assert.equal(choices.at(-1), 40)
  assert.equal(choices.includes(48), false)
})

test("a WAV-scale bitrate starts at 320", () => {
  assert.equal(choicesFor(1_411_200, 60).at(-1), 320)
})

test("the bottom of the 44.1 kHz ladder has no lower step", () => {
  assert.deepEqual(choicesFor(32_000, 10), [])
  assert.equal(closestStepIndex([]), 0)
})

test("a 22 kHz file uses the shorter ladder", () => {
  const choices = choicesFor(128_000, 30, 22050)
  assert.equal(choices.at(-1), 112)
  assert.equal(choices.includes(160), false)
  assert.equal(choices.includes(256), false)
})

test("estimateMp3Bytes matches payload size", () => {
  assert.equal(estimateMp3Bytes(8, 128), 128_000)
})

test("formatBytes uses KB and MB", () => {
  assert.equal(formatBytes(0), "0 KB")
  assert.equal(formatBytes(500 * 1024), "500 KB")
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB")
})
