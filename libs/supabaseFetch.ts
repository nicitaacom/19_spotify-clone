const retryHeader = "x-iat-retry"

export function issuedAtWaitMs(authorization: string | null, nowMs: number): number {
  const token = (authorization ?? "").replace(/^Bearer\s+/i, "")
  const part = token.split(".")[1]
  if (!part) return 1000
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/")
    const json = globalThis.atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="))
    const payload = JSON.parse(json) as { iat?: number }
    if (typeof payload.iat !== "number") return 1000
    const wait = payload.iat * 1000 - nowMs + 1500
    if (wait <= 0) return 1000
    return Math.min(wait, 10_000)
  } catch {
    return 1000
  }
}

// PostgREST rejects a user token when its "issued at" time is a few seconds ahead of the database clock.
export async function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const alreadyRetried = headers.get(retryHeader) === "1"
  headers.delete(retryHeader)
  const response = await fetch(input, { ...init, headers })
  if (alreadyRetried || response.ok) return response
  const body = await response.clone().text()
  if (!body.includes("JWT issued at future")) return response
  await new Promise(resolve => setTimeout(resolve, issuedAtWaitMs(headers.get("authorization"), Date.now())))
  const retryHeaders = new Headers(headers)
  retryHeaders.set(retryHeader, "1")
  return supabaseFetch(input, { ...init, headers: retryHeaders })
}

export const supabaseClientOptions = {
  global: { fetch: supabaseFetch },
}
