import assert from "node:assert/strict"
import test from "node:test"

import {
  isFilePathOwnedExclusively,
  remapAndFilterOwnedRows,
  remapRowsToCurrentUser,
} from "./backupOwnership.ts"

const SOURCE_USER_ID = "11111111-1111-4111-8111-111111111111"
const TARGET_USER_ID = "22222222-2222-4222-8222-222222222222"
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333"

test("remaps archived owners to only the authenticated target user", () => {
  assert.deepEqual(
    remapRowsToCurrentUser(
      [
        { user_id: SOURCE_USER_ID, song_id: 1 },
        { user_id: OTHER_USER_ID, song_id: 2 },
      ],
      TARGET_USER_ID,
    ),
    [
      { user_id: TARGET_USER_ID, song_id: 1 },
      { user_id: TARGET_USER_ID, song_id: 2 },
    ],
  )
})

test("keeps new and retry-safe owned rows while rejecting foreign primary-key collisions", () => {
  const rows = [
    { id: 1, user_id: SOURCE_USER_ID, song_path: "source/new.mp3" },
    { id: 2, user_id: SOURCE_USER_ID, song_path: "source/retry.mp3" },
    { id: 3, user_id: SOURCE_USER_ID, song_path: "source/foreign-id.mp3" },
  ]
  const existingRows = [
    { id: 2, user_id: TARGET_USER_ID, song_path: "source/retry.mp3" },
    { id: 3, user_id: OTHER_USER_ID, song_path: "other/song.mp3" },
  ]

  assert.deepEqual(remapAndFilterOwnedRows(rows, existingRows, TARGET_USER_ID, "id", ["song_path"]), [
    { id: 1, user_id: TARGET_USER_ID, song_path: "source/new.mp3" },
    { id: 2, user_id: TARGET_USER_ID, song_path: "source/retry.mp3" },
  ])
})

test("rejects a storage path already referenced by another user", () => {
  const rows = [{ id: 1, user_id: SOURCE_USER_ID, image_path: "covers/shared.png" }]
  const existingRows = [{ id: 9, user_id: OTHER_USER_ID, image_path: "covers/shared.png" }]

  assert.deepEqual(remapAndFilterOwnedRows(rows, existingRows, TARGET_USER_ID, "id", ["image_path"]), [])
  assert.equal(isFilePathOwnedExclusively([{ user_id: TARGET_USER_ID }], TARGET_USER_ID), true)
  assert.equal(
    isFilePathOwnedExclusively([{ user_id: TARGET_USER_ID }, { user_id: OTHER_USER_ID }], TARGET_USER_ID),
    false,
  )
  assert.equal(isFilePathOwnedExclusively([], TARGET_USER_ID), false)
})
