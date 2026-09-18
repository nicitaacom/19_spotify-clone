import assert from "node:assert/strict"
import { test } from "node:test"
import { registerHooks } from "node:module"

// Exercise the real fulfillment code with Stripe and database adapters. No keys,
// external requests or real payment records are used.
registerHooks({
  resolve(specifier, context, next) {
    const sources = {
      "server-only": "export {}",
      "@/libs/stripe": "export const stripe = globalThis.__paymentTestStripe",
      "@/libs/commerceAdmin": "export const commerceAdmin = globalThis.__paymentTestAdmin",
    }
    if (specifier in sources)
      return { url: `data:text/javascript,${encodeURIComponent(sources[specifier])}`, shortCircuit: true }
    if (specifier === "@/libs/commerceRules")
      return { url: new URL("../libs/commerceRules.ts", import.meta.url).href, shortCircuit: true }
    return next(specifier, context)
  },
})

let order, session, charge, dispute, writes
globalThis.__paymentTestStripe = {
  checkout: { sessions: { retrieve: async () => session, list: async () => ({ data: [session] }) } },
  paymentIntents: { retrieve: async () => ({ status: "succeeded", amount_received: 200, latest_charge: charge }) },
  disputes: { retrieve: async () => dispute },
}
globalThis.__paymentTestAdmin = {
  from: () => {
    let update
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: order, error: null }),
      update: values => {
        update = values
        return query
      },
      single: async () => {
        writes++
        order = { ...order, ...update }
        return { data: order, error: null }
      },
    }
    return query
  },
}
const { fulfillPlaylistCheckout, syncPlaylistCharge } = await import("../libs/playlistPayments.ts")
function reset() {
  order = {
    id: "order-A",
    user_id: "buyer",
    playlist_id: "A",
    stripe_session_id: "cs_test_A",
    price_cents: 200,
    currency: "usd",
    status: "pending",
    paid_at: null,
  }
  session = {
    id: "cs_test_A",
    mode: "payment",
    payment_status: "paid",
    client_reference_id: "buyer",
    currency: "usd",
    amount_total: 200,
    payment_intent: "pi_A",
    metadata: { kind: "playlist", order_id: "order-A", playlist_id: "A" },
  }
  charge = { paid: true, refunded: false, disputed: false, dispute: null }
  dispute = null
  writes = 0
}

test("only a confirmed matching payment grants access; retries retain the purchase date", async () => {
  reset()
  session.payment_status = "unpaid"
  assert.equal((await fulfillPlaylistCheckout(session.id, "buyer")).status, "pending")
  assert.equal(writes, 0)
  session.payment_status = "paid"
  const purchased = await fulfillPlaylistCheckout(session.id, "buyer")
  assert.equal(purchased.status, "paid")
  assert.equal(purchased.playlist_id, "A")
  assert.equal(purchased.stripe_payment_intent_id, "pi_A")
  assert.equal((await fulfillPlaylistCheckout(session.id, "buyer")).paid_at, purchased.paid_at)
})

test("wrong buyer, playlist, price, currency or session cannot fulfill an order", async () => {
  reset()
  await assert.rejects(() => fulfillPlaylistCheckout(session.id, "someone-else"))
  for (const [key, value] of [
    ["amount_total", 100],
    ["currency", "eur"],
    ["client_reference_id", "attacker"],
    ["id", "cs_another"],
  ]) {
    reset()
    session[key] = value
    await assert.rejects(() => fulfillPlaylistCheckout(session.id))
    assert.equal(writes, 0)
  }
  reset()
  session.metadata.playlist_id = "B"
  await assert.rejects(() => fulfillPlaylistCheckout(session.id))
})

test("out-of-order checkout completion cannot restore refunded or disputed access", async () => {
  reset()
  charge.refunded = true
  assert.equal((await fulfillPlaylistCheckout(session.id)).status, "refunded")
  assert.equal((await fulfillPlaylistCheckout(session.id)).status, "refunded")
  reset()
  charge.disputed = true
  charge.dispute = "dp_A"
  dispute = { status: "needs_response" }
  await syncPlaylistCharge("pi_A")
  assert.equal(order.status, "suspended")
  dispute = { status: "won" }
  await syncPlaylistCharge("pi_A")
  assert.equal(order.status, "paid")
  dispute = { status: "lost" }
  await syncPlaylistCharge("pi_A")
  assert.equal(order.status, "revoked")
})

test("subscription checkouts remain outside playlist fulfillment", async () => {
  reset()
  session.mode = "subscription"
  assert.equal(await fulfillPlaylistCheckout(session.id), null)
  assert.equal(writes, 0)
})
