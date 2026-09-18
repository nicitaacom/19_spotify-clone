import "server-only"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"

export async function reservePlaylistOrder(userId: string, playlist: { id: string; title: string; slug: string }, price: number) {
  const active = () => admin.from("19_playlist_orders").select("*")
    .eq("user_id", userId).eq("playlist_id", playlist.id).in("status", ["pending", "paid", "suspended"]).maybeSingle()
  const existing = await active()
  if (existing.error) throw existing.error
  if (existing.data) return existing.data
  const { data, error } = await admin.from("19_playlist_orders").insert({
    user_id: userId, playlist_id: playlist.id, playlist_title: playlist.title,
    playlist_slug: playlist.slug, price_cents: price,
  }).select("*").single()
  if (!error) return data
  if (error.code !== "23505") throw error
  const concurrent = await active()
  if (concurrent.error) throw concurrent.error
  if (!concurrent.data) throw new Error("Purchase state changed. Please try again.")
  return concurrent.data
}
