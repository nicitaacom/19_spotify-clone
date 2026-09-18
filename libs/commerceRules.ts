export const DEFAULT_PLAYLIST_PRICE = 200

export function parsePlaylistPrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 1000) {
    throw new Error("Choose a price between $1.00 and $10.00.")
  }
  return value
}

export function normalizeYoutubePlaylist(value: unknown): string {
  if (typeof value !== "string") throw new Error("A YouTube playlist link is required.")
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error("Enter a valid YouTube playlist link.")
  }
  const list = url.searchParams.get("list")
  if (
    url.protocol !== "https:" ||
    !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/playlist" ||
    !list ||
    !/^[a-zA-Z0-9_-]+$/.test(list)
  ) {
    throw new Error("Use https://www.youtube.com/playlist?list=…")
  }
  return `https://www.youtube.com/playlist?list=${list}`
}

export function formatPlaylistPrice(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100)
}

export function canPlaySong(
  isPaid: boolean,
  isOwner: boolean,
  purchasedPlaylistIds: Set<string>,
  memberPlaylistIds: string[]
) {
  return !isPaid || isOwner || memberPlaylistIds.some(id => purchasedPlaylistIds.has(id))
}

export function purchaseStatus(charge: { refunded: boolean; disputed: boolean }, disputeStatus?: string) {
  if (charge.refunded) return "refunded" as const
  if (disputeStatus === "lost") return "revoked" as const
  if (charge.disputed && disputeStatus !== "won" && disputeStatus !== "warning_closed") return "suspended" as const
  return "paid" as const
}
