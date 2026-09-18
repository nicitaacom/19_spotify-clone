import assert from "node:assert/strict"
import { test } from "node:test"
import { canPlaySong, normalizeYoutubePlaylist, parsePlaylistPrice, purchaseStatus } from "./commerceRules.ts"

test("prices accept USD cents only within the owner range", () => {
  for (const value of [100, 200, 199, 1000]) assert.equal(parsePlaylistPrice(value), value)
  for (const value of [0, 99, 1001, -100, 199.5, NaN, Infinity, "200", null])
    assert.throws(() => parsePlaylistPrice(value))
})

test("required YouTube playlist links are canonicalized without allowing foreign hosts", () => {
  const list = "PLhaOvy5XSZ0MUZwXFe5MUpMSL0I24NFTO"
  assert.equal(
    normalizeYoutubePlaylist(` https://youtube.com/playlist?list=${list}&si=tracking `),
    `https://www.youtube.com/playlist?list=${list}`
  )
  for (const url of [
    "",
    null,
    "http://youtube.com/playlist?list=x",
    "https://youtube.com.evil.test/playlist?list=x",
    "https://evil.test/playlist?list=x",
    "https://youtube.com/playlist",
    "https://youtube.com/watch?v=x",
    "https://user@youtube.com/playlist?list=x",
    "https://youtube.com:8443/playlist?list=x",
  ])
    assert.throws(() => normalizeYoutubePlaylist(url))
})

test("playlist entitlements cover shared songs and future additions without unlocking exclusive songs", () => {
  const purchases = new Set(["A"])
  assert.equal(canPlaySong(false, false, new Set(), []), true, "anonymous free listening")
  assert.equal(canPlaySong(true, false, new Set(), ["A"]), false, "anonymous cannot play paid tracks")
  assert.equal(canPlaySong(true, false, purchases, ["A"]), true, "purchased track")
  assert.equal(canPlaySong(true, false, purchases, ["A", "B"]), true, "shared song works throughout the website")
  assert.equal(canPlaySong(true, false, purchases, ["B"]), false, "B-only track stays locked")
  assert.equal(canPlaySong(true, false, purchases, ["personal"]), false, "copying a track does not grant a purchase")
  assert.equal(
    canPlaySong(true, false, purchases, ["B", "A"]),
    true,
    "later additions to A work without another payment"
  )
  assert.equal(canPlaySong(true, true, new Set(), []), true, "site owner access")
})

test("refunds and disputes do not accidentally grant access on webhook retries", () => {
  assert.equal(purchaseStatus({ refunded: true, disputed: false }), "refunded")
  assert.equal(purchaseStatus({ refunded: false, disputed: false }), "paid", "partial refunds retain access")
  assert.equal(purchaseStatus({ refunded: false, disputed: true }, "needs_response"), "suspended")
  assert.equal(purchaseStatus({ refunded: false, disputed: true }, "lost"), "revoked")
  assert.equal(purchaseStatus({ refunded: false, disputed: true }, "won"), "paid")
  assert.equal(purchaseStatus({ refunded: true, disputed: true }, "won"), "refunded")
})
