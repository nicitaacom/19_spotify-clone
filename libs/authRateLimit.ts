// In-memory rate limiter for auth endpoints (resets on server restart)
// Keyed by IP address. Each entry tracks attempt count and window start time.

interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()

function getIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  )
}

export function checkAuthRateLimit(
  request: Request,
  opts: { maxAttempts: number; windowMs: number },
): { allowed: boolean; remaining: number; resetInMs: number } {
  const ip = getIp(request)
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now - entry.windowStart > opts.windowMs) {
    store.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: opts.maxAttempts - 1, resetInMs: opts.windowMs }
  }

  if (entry.count >= opts.maxAttempts) {
    const resetInMs = opts.windowMs - (now - entry.windowStart)
    return { allowed: false, remaining: 0, resetInMs }
  }

  entry.count++
  return { allowed: true, remaining: opts.maxAttempts - entry.count, resetInMs: opts.windowMs - (now - entry.windowStart) }
}
