import "server-only"
import type Stripe from "stripe"
import { stripe } from "@/libs/stripe"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { purchaseStatus } from "@/libs/commerceRules"

// Both the verified webhook and authenticated return page use this operation.
// Re-read Stripe instead of trusting event ordering (e.g. a refund delivered
// before a retried checkout completion).
export async function fulfillPlaylistCheckout(sessionId: string, expectedUserId?: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.mode !== "payment" || session.metadata?.kind !== "playlist") return null
  const { data: order, error } = await admin
    .from("19_playlist_orders")
    .select("*")
    .eq("id", session.metadata.order_id)
    .maybeSingle()
  if (error) throw error
  if (
    !order ||
    (expectedUserId && order.user_id !== expectedUserId) ||
    session.client_reference_id !== order.user_id ||
    session.metadata.playlist_id !== order.playlist_id ||
    (order.stripe_session_id && order.stripe_session_id !== session.id) ||
    session.currency !== order.currency ||
    session.amount_total !== order.price_cents
  ) {
    throw new Error("Payment does not match this playlist purchase.")
  }
  if (session.payment_status !== "paid") return order
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
  if (!paymentIntentId) throw new Error("Payment confirmation is not ready.")
  const payment = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] })
  const charge = payment.latest_charge as Stripe.Charge | null
  if (
    !charge ||
    typeof charge === "string" ||
    !charge.paid ||
    payment.status !== "succeeded" ||
    payment.amount_received !== order.price_cents
  )
    throw new Error("Payment confirmation is not ready.")
  const dispute = charge.dispute
    ? typeof charge.dispute === "string"
      ? await stripe.disputes.retrieve(charge.dispute)
      : charge.dispute
    : null
  const status = purchaseStatus(charge, dispute?.status)
  const { data: updated, error: updateError } = await admin
    .from("19_playlist_orders")
    .update({
      status,
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_at: order.paid_at ?? new Date().toISOString(),
    })
    .eq("id", order.id)
    .select("*")
    .single()
  if (updateError) throw updateError
  return updated
}

export async function syncPlaylistCharge(paymentIntent: string | Stripe.PaymentIntent | null) {
  const id = typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id
  if (!id) return
  const sessions = await stripe.checkout.sessions.list({ payment_intent: id, limit: 1 })
  if (sessions.data[0]) await fulfillPlaylistCheckout(sessions.data[0].id)
}
