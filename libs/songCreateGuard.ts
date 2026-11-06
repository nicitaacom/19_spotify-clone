export const RECENT_UPLOAD_MS = 3 * 60 * 1000

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
