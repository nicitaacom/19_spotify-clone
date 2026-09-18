import { NextResponse } from "next/server"
import { requireCommerceUser, commerceError, isId } from "@/libs/commerceHttp"
import { fulfillPlaylistCheckout } from "@/libs/playlistPayments"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"

export async function POST(request: Request) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  try {
    const { session_id, playlist_id } = await request.json()
    if (!isId(playlist_id) || typeof session_id !== "string" || !/^cs_[a-zA-Z0-9_]+$/.test(session_id))
      throw new Error("Invalid payment reference.")
    const { data: order, error } = await admin
      .from("19_playlist_orders")
      .select("id")
      .eq("stripe_session_id", session_id)
      .eq("user_id", user.id)
      .eq("playlist_id", playlist_id)
      .maybeSingle()
    if (error) throw error
    if (!order) return NextResponse.json({ error: "Purchase not found for this account." }, { status: 404 })
    const result = await fulfillPlaylistCheckout(session_id, user.id)
    return NextResponse.json(
      { status: result?.status ?? "pending" },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return commerceError(error)
  }
}
