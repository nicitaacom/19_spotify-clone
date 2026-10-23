import assert from "node:assert/strict"
import test from "node:test"

import { issuedAtWaitMs, supabaseFetch } from "./supabaseFetch.ts"

const token = (iat) => {
  const payload = Buffer.from(JSON.stringify({ iat })).toString("base64url")
  return `header.${payload}.sig`
}

test("waits until a future issued-at time, and at least one second when it is already past", () => {
  const now = 1_700_000_000_000
  assert.equal(issuedAtWaitMs(`Bearer ${token(now / 1000 + 3)}`, now), 4500)
  assert.equal(issuedAtWaitMs(`Bearer ${token(now / 1000 - 30)}`, now), 1000)
  assert.equal(issuedAtWaitMs(null, now), 1000)
})

test("retries once when the database rejects a token issued ahead of its clock", async () => {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    calls.push(new Headers(init?.headers).get("authorization"))
    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "JWT issued at future" }), { status: 401 })
    }
    return new Response("[]", { status: 200 })
  }
  try {
    const response = await supabaseFetch("https://example.test/rest/v1/19_songs", {
      headers: { authorization: `Bearer ${token(Math.floor(Date.now() / 1000) - 5)}` },
    })
    assert.equal(response.status, 200)
    assert.equal(calls.length, 2)
  } finally {
    globalThis.fetch = original
  }
})
