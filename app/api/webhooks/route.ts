import Stripe from "stripe"
import { NextResponse } from "next/server"
import { headers } from "next/headers"

import { stripe } from "@/libs/stripe"
import { upsertProductRecord, upsertPriceRecord, manageSubscriptionStatusChange } from "@/libs/supabaseAdmin"
import { fulfillPlaylistCheckout, syncPlaylistCharge } from "@/libs/playlistPayments"
import { commerceAdmin } from "@/libs/commerceAdmin"

const relevantEvents = new Set([
  "product.created",
  "product.updated",
  "price.created",
  "price.updated",
  "checkout.session.completed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
])

export async function POST(request: Request) {
  const body = await request.text()
  const requestHeaders = await headers()
  const sig = requestHeaders.get("Stripe-Signature")

  const webhookSecret =
    process.env.NODE_ENV === "production"
      ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
      : process.env.STRIPE_WEBHOOK_SECRET_TEST

  let event: Stripe.Event

  try {
    if (!sig || !webhookSecret) return new NextResponse("Missing webhook signature or configuration", { status: 400 })
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(`❌ Error message: ${message}`)
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 })
  }

  console.log(34, "webhook triggered")

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case "product.created":
        case "product.updated":
          await upsertProductRecord(event.data.object as Stripe.Product)
          break
        case "price.created":
        case "price.updated":
          await upsertPriceRecord(event.data.object as Stripe.Price)
          break
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          const subscription = event.data.object as Stripe.Subscription
          await manageSubscriptionStatusChange(
            subscription.id,
            subscription.customer as string,
            event.type === "customer.subscription.created",
          )
          break
        case "checkout.session.completed":
          const checkoutSession = event.data.object as Stripe.Checkout.Session
          if (checkoutSession.mode === "payment" && checkoutSession.metadata?.kind === "playlist") {
            await fulfillPlaylistCheckout(checkoutSession.id)
          }
          if (checkoutSession.mode === "subscription") {
            const subscriptionId = checkoutSession.subscription
            await manageSubscriptionStatusChange(subscriptionId as string, checkoutSession.customer as string, true)
          }
          break
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session
          if (session.metadata?.kind === "playlist") {
            const { error } = await commerceAdmin.from("19_playlist_orders").update({ status: "expired" })
              .eq("id", session.metadata.order_id).eq("status", "pending")
            if (error) throw error
          }
          break
        }
        case "charge.refunded":
          await syncPlaylistCharge((event.data.object as Stripe.Charge).payment_intent)
          break
        case "charge.dispute.created":
        case "charge.dispute.updated":
        case "charge.dispute.closed": {
          const dispute = event.data.object as Stripe.Dispute
          const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id
          const charge = await stripe.charges.retrieve(chargeId)
          await syncPlaylistCharge(charge.payment_intent)
          break
        }
        default:
          throw new Error("Unhandled relevant event!")
      }
    } catch (error) {
      console.log(error)
      return new NextResponse('Webhook error: "Webhook handler failed. View logs."', { status: 400 })
    }
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
