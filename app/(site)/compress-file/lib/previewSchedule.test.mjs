import assert from "node:assert/strict"
import test from "node:test"

import { chunkStartSec, nextEncodeAtSec, PREVIEW_CHUNK_SEC, shouldEncodeNext } from "./previewSchedule.ts"

test("a 10 second part that took 5 seconds starts the next part at 5 seconds", () => {
  assert.equal(PREVIEW_CHUNK_SEC, 10)
  assert.equal(nextEncodeAtSec(0, 10, 5_000), 5)
  assert.equal(shouldEncodeNext(4.9, 0, 10, 5_000), false)
  assert.equal(shouldEncodeNext(5, 0, 10, 5_000), true)
  assert.equal(nextEncodeAtSec(440, 10, 5_000), 445)
})

test("a fast encode still starts the next part at half the part - 5, 15, 25 seconds", () => {
  assert.equal(nextEncodeAtSec(0, 10, 1_000), 5)
  assert.equal(nextEncodeAtSec(10, 10, 1_000), 15)
  assert.equal(nextEncodeAtSec(20, 10, 0), 25)
  assert.equal(shouldEncodeNext(4.9, 0, 10, 1_000), false)
  assert.equal(shouldEncodeNext(5, 0, 10, 1_000), true)
})

test("an encode slower than half the part starts the next part earlier", () => {
  assert.equal(nextEncodeAtSec(0, 10, 8_000), 2)
})

test("a part that takes longer than it plays starts the next part immediately", () => {
  assert.equal(nextEncodeAtSec(0, 10, 12_000), 0)
  assert.equal(shouldEncodeNext(0, 0, 10, 12_000), true)
})

test("playback stays inside the 10 second part that holds it", () => {
  assert.equal(chunkStartSec(0), 0)
  assert.equal(chunkStartSec(9.9), 0)
  assert.equal(chunkStartSec(10), 10)
  assert.equal(chunkStartSec(443), 440)
  assert.equal(chunkStartSec(-3), 0)
})
