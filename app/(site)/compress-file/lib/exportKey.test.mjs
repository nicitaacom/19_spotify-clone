import assert from "node:assert/strict"
import test from "node:test"

import { exportAction, exportKey } from "./exportKey.ts"

const file = { name: "WOT ambience - new year hangar 2020.mp3", size: 90_500_000, lastModified: 10 }

test("the same file and bitrate keep one export key", () => {
  assert.equal(exportKey(file, 64), exportKey(file, 64))
  assert.notEqual(exportKey(file, 64), exportKey(file, 96))
  assert.notEqual(exportKey(file, 64), exportKey({ ...file, size: file.size + 1 }, 64))
})

test("a finished file stays ready, and a new bitrate encodes", () => {
  const key = exportKey(file, 64)
  assert.equal(exportAction(null, key), "encode")
  assert.equal(exportAction(key, key), "ready")
  assert.equal(exportAction(key, exportKey(file, 96)), "encode")
})
