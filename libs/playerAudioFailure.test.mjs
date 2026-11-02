import test from "node:test"
import assert from "node:assert/strict"
import { nextAudioFailureStep } from "./playerAudioFailure.ts"

const base = {
  urlNearExpiry: false,
  started: false,
  recoveryAttempts: 0,
  openAttempts: 0,
  repeatOne: false,
  hasNext: true,
  skippedInARow: 0,
  maxRecoveryAttempts: 3,
  maxOpenAttempts: 1,
  maxSkips: 3,
}

test("a song that has not started retries once before the queue moves on", () => {
  assert.equal(nextAudioFailureStep(base), "refresh")
  assert.equal(nextAudioFailureStep({ ...base, openAttempts: 1 }), "skip")
  assert.equal(nextAudioFailureStep({ ...base, openAttempts: 1, hasNext: false }), "stop")
})

test("a song that already started keeps recovering, then skips", () => {
  assert.equal(nextAudioFailureStep({ ...base, started: true, recoveryAttempts: 2 }), "recover")
  assert.equal(nextAudioFailureStep({ ...base, started: true, recoveryAttempts: 3 }), "skip")
})

test("repeat of one song and too many skips stop instead of walking the queue", () => {
  assert.equal(nextAudioFailureStep({ ...base, started: true, recoveryAttempts: 3, repeatOne: true }), "stop")
  assert.equal(nextAudioFailureStep({ ...base, openAttempts: 1, skippedInARow: 3 }), "stop")
})

test("an expiring address refreshes before any skip", () => {
  assert.equal(nextAudioFailureStep({ ...base, urlNearExpiry: true, started: true, recoveryAttempts: 3 }), "refresh")
})
