import { NextResponse } from "next/server"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { stripe } from "@/libs/stripe"
import { createOrRetrieveCustomer } from "@/libs/supabaseAdmin"
import { requireCommerceUser, commerceError, isId } from "@/libs/commerceHttp"
import { isOwnerId } from "@/libs/getOwnerIds"
import { fulfillPlaylistCheckout } from "@/libs/playlistPayments"
import { getURL } from "@/app/utils/getURL"
import { reservePlaylistOrder } from "@/libs/playlistOrders"

export async function POST(request: Request) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  try {
    const { playlist_id } = await request.json()
    if (!isId(playlist_id)) throw new Error("Invalid playlist.")
    const { data: playlist, error } = await admin.from("19_playlists").select("*").eq("id", playlist_id).maybeSingle()
    if (error) throw error
    if (!playlist || !isOwnerId(playlist.user_id) || playlist.visibility === "private")
      return NextResponse.json({ error: "Playlist not available." }, { status: 404 })
    if (isOwnerId(user.id)) throw new Error("You already have owner access.")
    const { data: config, error: configError } = await admin
      .from("19_playlist_commerce")
      .select("sales_enabled,price_cents")
      .eq("playlist_id", playlist_id)
      .maybeSingle()
    if (configError) throw configError
    const { data: owned, error: ownedError } = await admin
      .from("19_playlist_orders")
      .select("id")
      .eq("user_id", user.id)
      .eq("playlist_id", playlist_id)
      .eq("status", "paid")
      .limit(1)
    if (ownedError) throw ownedError
    if (owned?.length) return NextResponse.json({ purchased: true })
    if (!config?.sales_enabled) throw new Error("Purchases are currently unavailable for this playlist.")
    const order = await reservePlaylistOrder(user.id, playlist, config.price_cents)
    if (order.status === "paid") return NextResponse.json({ purchased: true })
    if (order.status === "suspended")
      throw new Error(
        "This purchase has an open payment dispute. It cannot be purchased again until the dispute is resolved."
      )
    if (order.stripe_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(order.stripe_session_id)
      if (existing.status === "open") return NextResponse.json({ sessionId: existing.id })
      if (existing.status === "complete") {
        const confirmed = await fulfillPlaylistCheckout(existing.id, user.id)
        return NextResponse.json({ purchased: confirmed?.status === "paid", pending: confirmed?.status === "pending" })
      }
      const { error: expireError } = await admin
        .from("19_playlist_orders")
        .update({ status: "expired" })
        .eq("id", order.id)
        .eq("status", "pending")
      if (expireError) throw expireError
      return NextResponse.json({ error: "Your previous checkout expired. Please try again." }, { status: 409 })
    }
    // Persist the order before contacting Stripe. The order ID is a stable
    // idempotency key even when the response or database update is interrupted.
    if (Date.now() - Date.parse(order.created_at) > 23 * 3600_000) {
      // Stripe retains idempotency keys for at least 24h. Reconcile an unlinked
      // session before allowing a new key, rather than risking a second charge.
      const sessions = await stripe.checkout.sessions.list({
        customer: await createOrRetrieveCustomer({ uuid: user.id, email: user.email ?? "" }),
        limit: 100,
      })
      const previous = sessions.data.find(s => s.metadata?.order_id === order.id)
      if (previous) {
        const { error: linkError } = await admin
          .from("19_playlist_orders")
          .update({ stripe_session_id: previous.id })
          .eq("id", order.id)
        if (linkError) throw linkError
        if (previous.status === "complete") await fulfillPlaylistCheckout(previous.id, user.id)
      } else if (!sessions.has_more) {
        const { error: expireError } = await admin
          .from("19_playlist_orders")
          .update({ status: "expired" })
          .eq("id", order.id)
          .eq("status", "pending")
        if (expireError) throw expireError
      }
      throw new Error("Reconciling your previous checkout. Please try again shortly.")
    }
    const customer = await createOrRetrieveCustomer({ uuid: user.id, email: user.email ?? "" })
    const metadata = { kind: "playlist", order_id: order.id, playlist_id, user_id: user.id }
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer,
        client_reference_id: user.id,
        payment_method_types: ["card"],
        metadata,
        payment_intent_data: { metadata },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: order.price_cents,
              product_data: {
                name: order.playlist_title,
                description: "One-time playlist access, future additions and a shareable YouTube playlist link.",
              },
            },
          },
        ],
        success_url: getURL(
          `playlists/${encodeURIComponent(order.playlist_slug)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        ),
        cancel_url: getURL(`playlists/${encodeURIComponent(order.playlist_slug)}?checkout=cancelled`),
      },
      { idempotencyKey: `playlist-order-${order.id}` }
    )
    const { error: saveError } = await admin
      .from("19_playlist_orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order.id)
    if (saveError) throw saveError
    return NextResponse.json({ sessionId: session.id })
  } catch (error) {
    return commerceError(error)
  }
}
