import test from "node:test"
import assert from "node:assert/strict"
import { playbackStep, trackFinished } from "./playerTrackEnd.ts"

const moving = {
  durationSec: 180,
  positionSec: 40,
  previousSec: 39.6,
  ended: false,
  paused: false,
  recovering: false,
  seeking: false,
}

test("a normal sample keeps the same song", () => {
  assert.equal(playbackStep(moving), "continue")
  assert.equal(playbackStep({ ...moving, previousSec: -1, positionSec: 0 }), "continue")
  assert.equal(playbackStep({ ...moving, durationSec: Number.POSITIVE_INFINITY, positionSec: 12, previousSec: 11.6 }), "continue")
})

test("ended, a freeze in the last window, or a jump back to the start moves on", () => {
  assert.equal(playbackStep({ ...moving, ended: true, positionSec: 180, previousSec: 179.8 }), "advance")
  assert.equal(playbackStep({ ...moving, durationSec: 100, positionSec: 99.7, previousSec: 99.7 }), "advance")
  assert.equal(playbackStep({ ...moving, positionSec: 0.2, previousSec: 100 }), "advance")
  assert.equal(playbackStep({ ...moving, durationSec: Number.POSITIVE_INFINITY, positionSec: 0, previousSec: 50 }), "advance")
})

test("a seek, a pause, or stall recovery does not move on", () => {
  assert.equal(playbackStep({ ...moving, seeking: true, positionSec: 0, previousSec: 100 }), "ignore")
  assert.equal(playbackStep({ ...moving, paused: true }), "ignore")
  assert.equal(playbackStep({ ...moving, recovering: true, positionSec: 0, previousSec: 40 }), "ignore")
  assert.equal(playbackStep({ ...moving, positionSec: 39.4, previousSec: 39.6 }), "continue")
})

test("the last window still moving stays on this song", () => {
  assert.equal(playbackStep({ ...moving, durationSec: 100, positionSec: 99.8, previousSec: 99.4 }), "continue")
})

test("trackFinished matches the ended flag and the last window", () => {
  assert.equal(trackFinished(Number.NaN, 0, true), true)
  assert.equal(trackFinished(100, 99.6, false), true)
  assert.equal(trackFinished(100, 90, false), false)
  assert.equal(trackFinished(Number.POSITIVE_INFINITY, 90, false), false)
})
