import assert from "node:assert/strict"
import test from "node:test"

import { parseAudioByteRange, sliceAudioStream } from "./audioRange.ts"

test("parses ordinary, open-ended, and suffix audio byte ranges", () => {
  assert.deepEqual(parseAudioByteRange("bytes=40-59", 100), { start: 40, end: 59 })
  assert.deepEqual(parseAudioByteRange("bytes=40-", 100), { start: 40, end: 99 })
  assert.deepEqual(parseAudioByteRange("bytes=-20", 100), { start: 80, end: 99 })
  assert.deepEqual(parseAudioByteRange("bytes=90-200", 100), { start: 90, end: 99 })
  assert.equal(parseAudioByteRange("bytes=100-", 100), null)
  assert.equal(parseAudioByteRange("bytes=60-40", 100), null)
  assert.equal(parseAudioByteRange("bytes=0-5,10-15", 100), null)
})

test("extracts the requested bytes from a full response across chunk boundaries", async () => {
  const chunks = [Uint8Array.from([0, 1]), Uint8Array.from([2, 3, 4]), Uint8Array.from([5, 6, 7, 8, 9])]
  const fullResponse = new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(chunk)
      else controller.close()
    },
  })
  const partial = sliceAudioStream(fullResponse, 3, 4)
  const bytes = new Uint8Array(await new Response(partial).arrayBuffer())
  assert.deepEqual([...bytes], [3, 4, 5, 6])
})

test("rejects a response that ends before the requested range", async () => {
  const shortResponse = new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from([0, 1, 2]))
      controller.close()
    },
  })
  await assert.rejects(new Response(sliceAudioStream(shortResponse, 2, 4)).arrayBuffer())
})
