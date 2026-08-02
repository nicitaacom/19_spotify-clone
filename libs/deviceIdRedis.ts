import { Redis } from "@upstash/redis"

/**
 * Layers 0, 3 and 4 of the visitor identity:
 *
 *   utm:device-id:by-user-id:<account uuid>  -> deviceId, expiring 30 days after the last visit
 *   utm:device-id:by-ip:<ip>                 -> deviceId, expiring at midnight in the visitor's timezone
 *   utm:device-id:by-fingerprint:<sha256>    -> deviceId, expiring 10 minutes after it was written
 *
 * Each expiry matches how much the key proves. A signed-in account is exact - the session says who
 * this is, so the link stays good for a month and is refreshed on every visit. An address is weaker
 * (everyone behind one router shares it) so it lasts the visitor's day. A fingerprint match is a
 * probability - a different browser on similar hardware tells the server nothing definite - so 10
 * minutes means a coincidental match bridges one short session rather than claiming someone else's
 * deviceId for the rest of the day.
 */
const USER_ID_TTL_SECONDS = 60 * 60 * 24 * 30
const FINGERPRINT_TTL_SECONDS = 600
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/

let redisClient: Redis | null = null

function getRedisClient(): Redis {
  if (!redisClient) redisClient = Redis.fromEnv()
  return redisClient
}

function getDeviceIdByUserIdKey(userId: string): string {
  return `utm:device-id:by-user-id:${userId}`
}

function getDeviceIdByIpKey(ip: string): string {
  return `utm:device-id:by-ip:${ip}`
}

function getDeviceIdByFingerprintKey(fingerprint: string): string {
  return `utm:device-id:by-fingerprint:${fingerprint}`
}

/**
 * Layer 0 - the strongest link there is, because the account id is read from the verified Supabase
 * session server-side rather than sent by the browser. No shape check for that reason: unlike the
 * fingerprint and the IP headers, nothing a visitor can type reaches this key.
 */
export async function getRedisDeviceIdByUserId(userId: string): Promise<string | null> {
  const redis = getRedisClient()

  return redis.get<string>(getDeviceIdByUserIdKey(userId))
}

export async function setRedisDeviceIdByUserId(userId: string, deviceId: string): Promise<void> {
  const redis = getRedisClient()
  await redis.set(getDeviceIdByUserIdKey(userId), deviceId, { ex: USER_ID_TTL_SECONDS })
}

export async function getRedisDeviceIdByIp(ip: string): Promise<string | null> {
  const redis = getRedisClient()

  return redis.get<string>(getDeviceIdByIpKey(ip))
}

export async function setRedisDeviceIdByIp(ip: string, deviceId: string, visitorDayEnd: Date): Promise<void> {
  const redis = getRedisClient()
  await redis.set(getDeviceIdByIpKey(ip), deviceId, { exat: Math.floor(visitorDayEnd.getTime() / 1000) })
}

/**
 * The fingerprint reaches the server as an action argument, so its shape is checked before it becomes
 * a key - `computeFingerprint` only ever returns a sha256 hex digest, but without this check a caller
 * sends a megabyte of text and has it written to Redis as a key.
 */
export async function getRedisDeviceIdByFingerprint(fingerprint: string): Promise<string | null> {
  if (!FINGERPRINT_PATTERN.test(fingerprint)) return null
  const redis = getRedisClient()

  return redis.get<string>(getDeviceIdByFingerprintKey(fingerprint))
}

export async function setRedisDeviceIdByFingerprint(fingerprint: string, deviceId: string): Promise<void> {
  if (!FINGERPRINT_PATTERN.test(fingerprint)) return
  const redis = getRedisClient()
  await redis.set(getDeviceIdByFingerprintKey(fingerprint), deviceId, { ex: FINGERPRINT_TTL_SECONDS })
}
