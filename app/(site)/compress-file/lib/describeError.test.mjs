import assert from "node:assert/strict"
import test from "node:test"

import { describeError } from "./describeError.ts"

test("describeError includes the name, message, and cause", () => {
  const cause = new Error("buffer is detached")
  cause.name = "TypeError"
  const error = new Error("decodeAudioData rejected the bytes")
  error.name = "EncodingError"
  error.cause = cause
  assert.equal(
    describeError(error),
    "EncodingError: decodeAudioData rejected the bytes. Cause: TypeError: buffer is detached.",
  )
})

test("describeError stringifies a non-Error", () => {
  assert.equal(describeError("bad bytes"), "Error: bad bytes")
})

test("describeError does not add a second period", () => {
  const error = new Error("copyTo destination is not large enough.")
  error.name = "RangeError"
  assert.equal(describeError(error), "RangeError: copyTo destination is not large enough.")
})
