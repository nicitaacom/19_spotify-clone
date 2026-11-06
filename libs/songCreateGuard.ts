export const RECENT_UPLOAD_MS = 3 * 60 * 1000

export function sameSongExistsMessage(songName: string) {
  return `same song ${songName} already exists`
}

export function isSameSongExistsMessage(message: string) {
  return message.startsWith("same song ") && message.endsWith(" already exists") && message.length > "same song  already exists".length
}

export function sameSongErrorText(bodyText: string) {
  try {
    const body = JSON.parse(bodyText) as { error?: unknown }
    if (typeof body.error === "string" && isSameSongExistsMessage(body.error)) return body.error
  } catch {
    return ""
  }
  return ""
}

export function createdInsideWindow(createdAt: string | null | undefined, nowMs: number, windowMs = RECENT_UPLOAD_MS) {
  if (!createdAt) return false
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && created <= nowMs + 5000 && nowMs - created < windowMs
}

export function lockIsStale(startedAtMs: number, nowMs: number, windowMs = RECENT_UPLOAD_MS) {
  return !Number.isFinite(startedAtMs) || nowMs - startedAtMs > windowMs
}

export function isStoredObjectPresent(error: unknown) {
  if (!error || typeof error !== "object") return false
  const record = error as { message?: string; statusCode?: string | number; status?: string | number; error?: string }
  const status = String(record.statusCode ?? record.status ?? "")
  if (status === "409") return true
  const message = `${record.message ?? ""} ${record.error ?? ""}`.toLowerCase()
  return message.includes("already exists") || message.includes("duplicate")
}

export function uploadSlotPath(userId: string, title: string, author: string, size: number) {
  let hash = 5381
  const text = `${userId}\n${title}\n${author}\n${size}`
  for (let index = 0; index < text.length; index++) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0
  return `upload-lock/${hash.toString(16)}`
}
