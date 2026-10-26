import assert from "node:assert/strict"
import test from "node:test"

import { exportAction, exportKey } from "./exportKey.ts"

const file = { name: "WOT ambience - new year hangar 2020.mp3", size: 90_500_000, lastModified: 10 }

test("the same file and bitrate keep one export key", () => {
  assert.equal(exportKey(file, 64), exportKey(file, 64))
  assert.notEqual(exportKey(file, 64), exportKey(file, 96))
  assert.notEqual(exportKey(file, 64), exportKey({ ...file, size: file.size + 1 }, 64))
})

test("a finished export is saved again, and the click after Escape is skipped", () => {
  const key = exportKey(file, 64)
  assert.equal(exportAction(null, key, 0, 1_000), "encode")
  assert.equal(exportAction(key, key, 0, 1_000), "save")
  assert.equal(exportAction(key, key, 1_500, 1_000), "skip")
  assert.equal(exportAction(key, exportKey(file, 96), 1_500, 1_000), "encode")
})
