import { isIP } from "node:net"

const IPV4_MAPPED_PREFIX = "::ffff:"
const PRIVATE_IPV4_PATTERN = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/
const PRIVATE_IPV6_PATTERN = /^(::1?$|f[cd]|fe80:)/i

/** The address the request arrived with - `x-real-ip` first, then the client end of `x-forwarded-for`. */
export function getRequestIp(requestHeaders: Headers): string | null {
  const realIp = requestHeaders.get("x-real-ip")?.trim()
  const forwardedForClient = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()

  return realIp || forwardedForClient || null
}

/**
 * An address has to earn its way into a Redis key. Both headers `getRequestIp` reads arrive with the
 * request, so anything `isIP` refuses to parse is refused here too - otherwise a hand-written
 * `x-forwarded-for: pick-me` becomes a key any number of people aim at. Loopback and the private
 * ranges are refused as well: everyone behind one router shares them, so they name a household
 * rather than a visitor, and a VPS `next start` with no reverse proxy in front of it hands every
 * visitor the same literal `127.0.0.1`.
 */
export function isTrustworthyIp(ip: string | null): ip is string {
  if (!ip) return false

  const address = ip.toLowerCase().startsWith(IPV4_MAPPED_PREFIX) ? ip.slice(IPV4_MAPPED_PREFIX.length) : ip
  if (!isIP(address)) return false

  return !PRIVATE_IPV4_PATTERN.test(address) && !PRIVATE_IPV6_PATTERN.test(address)
}
