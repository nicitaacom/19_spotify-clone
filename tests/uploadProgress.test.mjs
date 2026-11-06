import assert from "node:assert/strict"
import test from "node:test"

import {
  byteSendPercent,
  formatTimeLeft,
  remainingSendMs,
  storePercent,
  storeWaitLimitMs,
  uploadButtonLabel,
} from "../libs/uploadProgress.ts"

test("byte send stays at 90 when every byte has left the browser", () => {
  assert.equal(byteSendPercent(0, 1000), 0)
  assert.equal(byteSendPercent(500, 1000), 45)
  assert.equal(byteSendPercent(1000, 1000), 90)
})

test("store creeps from 90 to 99 and stops there", () => {
  assert.equal(storePercent(0, 10_000), 90)
  assert.equal(storePercent(5_000, 10_000), 95)
  assert.equal(storePercent(10_000, 10_000), 99)
  assert.equal(storePercent(30_000, 10_000), 99)
})

test("time left uses the remaining bytes and a speed", () => {
  assert.equal(remainingSendMs(500, 1000, 100), 5_000)
  assert.equal(remainingSendMs(1000, 1000, 100), null)
  assert.equal(formatTimeLeft(5_000), "about 5s")
  assert.equal(formatTimeLeft(90_000), "about 2 min")
  assert.equal(formatTimeLeft(200), "under 1s")
})

test("a finished send waits at least 3 minutes, longer when the send itself was long", () => {
  assert.equal(storeWaitLimitMs(1_000), 3 * 60 * 1000)
  assert.equal(storeWaitLimitMs(4 * 60 * 1000), 8 * 60 * 1000)
})

test("the button names the phase and keeps 100 off the label", () => {
  assert.equal(uploadButtonLabel({
    preparing: true,
    storing: false,
    percent: 100,
    speed: "",
    timeLeft: "",
  }), "Preparing audio… 99%")
  assert.equal(uploadButtonLabel({
    preparing: false,
    storing: false,
    percent: 45,
    speed: "4.9 MB/s",
    timeLeft: "about 12s",
  }), "Uploading… 45% · 4.9 MB/s · about 12s left")
  assert.equal(uploadButtonLabel({
    preparing: false,
    storing: true,
    percent: 94,
    speed: "4.9 MB/s",
    timeLeft: "about 8s",
  }), "Storing the song… 94% · about 8s left")
  assert.equal(uploadButtonLabel({
    preparing: false,
    storing: true,
    percent: 100,
    speed: "",
    timeLeft: "",
  }), "Storing the song… 99% · still working")
})
