import assert from "node:assert/strict"
import test from "node:test"

import { isSameSongExistsMessage, isStoredObjectPresent, lockIsStale, sameSongErrorText, sameSongExistsMessage, uploadSlotPath } from "../libs/songCreateGuard.ts"

test("a repeated song names the title in the error", () => {
  assert.equal(sameSongExistsMessage("Server room"), "same song Server room already exists")
  assert.equal(isSameSongExistsMessage("same song Server room already exists"), true)
  assert.equal(isSameSongExistsMessage("This song is already uploading. Wait for it to finish."), false)
  assert.equal(sameSongErrorText(JSON.stringify({ error: sameSongExistsMessage("Server room") })), "same song Server room already exists")
  assert.equal(sameSongErrorText("{"), "")
})

test("storage 409 and the duplicate message count as the object already being there", () => {
  assert.equal(isStoredObjectPresent({ statusCode: "409", message: "The resource already exists" }), true)
  assert.equal(isStoredObjectPresent({ status: 409 }), true)
  assert.equal(isStoredObjectPresent({ message: "duplicate" }), true)
  assert.equal(isStoredObjectPresent({ message: "network down" }), false)
  assert.equal(isStoredObjectPresent(null), false)
})

test("a lock older than the window can be taken again", () => {
  const now = 1_000_000
  assert.equal(lockIsStale(now - 60_000, now), false)
  assert.equal(lockIsStale(now - 4 * 60_000, now), true)
  assert.equal(lockIsStale(Number.NaN, now), true)
})

test("the same title, author, and size share one slot path", () => {
  const first = uploadSlotPath("user-1", "Server room", "unknown", 52000000)
  const second = uploadSlotPath("user-1", "Server room", "unknown", 52000000)
  const otherSize = uploadSlotPath("user-1", "Server room", "unknown", 12000000)
  assert.equal(first, second)
  assert.notEqual(first, otherSize)
  assert.equal(first.startsWith("upload-lock/"), true)
})
