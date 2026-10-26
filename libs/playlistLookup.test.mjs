import assert from "node:assert/strict"
import test from "node:test"

import { choosePlaylistRow } from "./playlistLookup.ts"

const row = { slug: "hans-zimmer", visibility: "public" }
const empty = { data: null, error: null }
const failed = (message) => ({ data: null, error: { message } })

test("a user-client row is the playlist", () => {
  const chosen = choosePlaylistRow({ data: row, error: null }, null, empty)
  assert.equal(chosen.row, row)
  assert.equal(chosen.failure, null)
})

test("a retry row is used when the first user read failed", () => {
  const chosen = choosePlaylistRow(failed("JWT expired"), { data: row, error: null }, empty)
  assert.equal(chosen.row, row)
  assert.equal(chosen.failure, null)
})

test("an admin row is used when the user client returned no row", () => {
  const chosen = choosePlaylistRow(empty, null, { data: row, error: null })
  assert.equal(chosen.row, row)
  assert.equal(chosen.failure, null)
})

test("two failed reads stay a failure, and two empty reads stay missing", () => {
  const failedBoth = choosePlaylistRow(failed("JWT expired"), failed("JWT expired"), failed("Unauthorized"))
  assert.equal(failedBoth.row, null)
  assert.match(failedBoth.failure, /JWT expired/)
  assert.match(failedBoth.failure, /Unauthorized/)

  const missing = choosePlaylistRow(empty, null, empty)
  assert.equal(missing.row, null)
  assert.equal(missing.failure, null)
})

test("an admin failure after an empty user read stays a missing row", () => {
  const chosen = choosePlaylistRow(empty, null, failed("Unauthorized"))
  assert.equal(chosen.row, null)
  assert.equal(chosen.failure, null)
})
