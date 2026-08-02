"use server"

import { cookies, headers } from "next/headers"

import { TTrackVisitResult } from "@/ts/TTrackVisitResult"
import { createDeviceId, decodeDeviceId, encodeDeviceId, isValidDeviceId } from "@/app/utils/deviceId"
import { decryptDeviceId, DEVICE_ID_COOKIE_NAME, encryptDeviceId } from "@/app/utils/deviceIdCookie"
import { getRequestIp, isTrustworthyIp } from "@/app/utils/requestIp"
import { getVisitorDayEnd, getVisitorDayStart } from "@/app/utils/visitorDayBounds"
import {
  getRedisDeviceIdByFingerprint,
  getRedisDeviceIdByIp,
  getRedisDeviceIdByUserId,
  setRedisDeviceIdByFingerprint,
  setRedisDeviceIdByIp,
  setRedisDeviceIdByUserId,
} from "@/libs/deviceIdRedis"
import { createServerComponentClient } from "@/libs/supabaseServer"
import { supabaseAdmin } from "@/libs/supabaseAdmin"

interface UTMParams {
  source?: string
  medium?: string
  campaign?: string
}

type SyncDeviceIdLayersParams = {
  deviceId: string
  userId: string | null
  cookieDeviceId: string | null
  trustworthyIp: string | null
  fingerprint: string | null
  visitorDayEnd: Date
}

function firstParamValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function extractUTMParams(searchParams: { [key: string]: string | string[] | undefined } = {}): UTMParams {
  return {
    source: firstParamValue(searchParams.utm_source),
    medium: firstParamValue(searchParams.utm_medium),
    campaign: firstParamValue(searchParams.utm_campaign),
  }
}

/** The signed-in account, read from the verified session - never a value the browser sent. */
async function getSessionUserId(): Promise<string | null> {
  try {
    const supabase = await createServerComponentClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    return session?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Layers 0-3, tried in order, first answer wins: the signed-in account, then localStorage (the
 * transport form the browser sent), then the httpOnly cookie, then the IP -> deviceId Redis key.
 * Every candidate goes through `isValidDeviceId`, so an edited localStorage value falls through
 * exactly as an empty one would.
 *
 * The account goes first because it is the only exact signal here - the session already proved who
 * this is, while localStorage, the cookie and the IP each only suggest it. So a person signing in on
 * a machine they have never used keeps the deviceId their account already had, instead of being
 * counted as somebody new.
 */
async function resolveDeviceIdBeforeFingerprint(
  userId: string | null,
  storedDeviceId: string | null,
  cookieDeviceId: string | null,
  trustworthyIp: string | null,
): Promise<string | null> {
  if (userId) {
    const getRedisDeviceIdByUserIdResp = await getRedisDeviceIdByUserId(userId)
    if (getRedisDeviceIdByUserIdResp && isValidDeviceId(getRedisDeviceIdByUserIdResp)) return getRedisDeviceIdByUserIdResp
  }

  const clientDeviceId = storedDeviceId ? decodeDeviceId(storedDeviceId) : null
  if (clientDeviceId && isValidDeviceId(clientDeviceId)) return clientDeviceId
  if (cookieDeviceId && isValidDeviceId(cookieDeviceId)) return cookieDeviceId
  if (!trustworthyIp) return null

  const getRedisDeviceIdByIpResp = await getRedisDeviceIdByIp(trustworthyIp)

  return getRedisDeviceIdByIpResp && isValidDeviceId(getRedisDeviceIdByIpResp) ? getRedisDeviceIdByIpResp : null
}

/** Layer 4 - the fingerprint -> deviceId Redis key, reached only after layers 1-3 all missed. */
async function resolveDeviceIdFromFingerprint(fingerprint: string): Promise<string | null> {
  const getRedisDeviceIdByFingerprintResp = await getRedisDeviceIdByFingerprint(fingerprint)
  if (!getRedisDeviceIdByFingerprintResp || !isValidDeviceId(getRedisDeviceIdByFingerprintResp)) return null

  return getRedisDeviceIdByFingerprintResp
}

/**
 * Re-points every layer at the winning id: the account key (skipped for a signed-out visitor), the
 * IP key (skipped for an untrustworthy IP), the fingerprint key (skipped when no fingerprint was
 * sent, which is every layer 0-3 hit), and the cookie - re-set only when the existing one decrypts
 * to a different id.
 */
async function syncDeviceIdLayers({
  deviceId,
  userId,
  cookieDeviceId,
  trustworthyIp,
  fingerprint,
  visitorDayEnd,
}: SyncDeviceIdLayersParams): Promise<void> {
  if (userId) await setRedisDeviceIdByUserId(userId, deviceId)
  if (trustworthyIp) await setRedisDeviceIdByIp(trustworthyIp, deviceId, visitorDayEnd)
  if (fingerprint) await setRedisDeviceIdByFingerprint(fingerprint, deviceId)
  if (cookieDeviceId === deviceId) return

  const cookieStore = await cookies()
  cookieStore.set(DEVICE_ID_COOKIE_NAME, encryptDeviceId(deviceId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: visitorDayEnd,
    path: "/",
  })
}

async function insertDBUTMVisitAction(userId: string, utmParams: UTMParams, userAgent: string | null, pageUrl: string | null) {
  try {
    const { error } = await supabaseAdmin.from("utm_stats").insert({
      user_id: userId,
      source: utmParams.source,
      medium: utmParams.medium,
      campaign: utmParams.campaign,
      url: pageUrl,
      user_agent: userAgent,
    })
    if (error) throw Error(error.message)
  } catch (error) {
    return `Error tracking UTM visit: ${error instanceof Error ? error.message : "Unknown error"}`
  }
}

/** One row per deviceId per visitor day - a second visit inside the same day adds nothing. */
async function insertDBVisitOncePerDay(
  deviceId: string,
  searchParams: { [key: string]: string | string[] | undefined },
  pageUrl: string | undefined,
  visitorDayStart: Date,
): Promise<void> {
  const utmParams = extractUTMParams(searchParams)
  const hasUTMParams = Object.values(utmParams).some(param => param !== undefined)

  const { data: recentVisit } = await supabaseAdmin
    .from("utm_stats")
    .select("id, created_at")
    .eq("user_id", deviceId)
    .gte("created_at", visitorDayStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentVisit) return

  const finalParams = hasUTMParams ? utmParams : { source: "organic", medium: "direct", campaign: undefined }
  const userAgent = (await headers()).get("user-agent")
  const insertDBUTMVisitActionResp = await insertDBUTMVisitAction(deviceId, finalParams, userAgent, pageUrl || null)
  if (typeof insertDBUTMVisitActionResp === "string") console.error("UTM insert failed:", insertDBUTMVisitActionResp)
}

/**
 * Attributes one visit to one deviceId, resolved through 5 layers (see
 * `app/features/UTM/dev_readme-utm.md`), and records at most one `utm_stats` row per deviceId per
 * visitor day.
 *
 * Called twice at most. The browser has no way to tell whether layers 0, 2 and 3 hit - the account
 * and IP mappings sit in Redis and the cookie is httpOnly - so the server asks for a fingerprint only
 * when it needs one, and the `fingerprint` argument ends the exchange: `null` means "not computed
 * yet, ask me", `""` means "computed and the browser gave nothing", so a new id is minted instead of
 * asking twice.
 */
export async function trackVisitAction(
  storedDeviceId: string | null,
  searchParams: { [key: string]: string | string[] | undefined } = {},
  pageUrl?: string,
  timezone?: string,
  fingerprint: string | null = null,
): Promise<TTrackVisitResult> {
  const requestHeaders = await headers()
  const requestIp = getRequestIp(requestHeaders)
  const trustworthyIp = isTrustworthyIp(requestIp) ? requestIp : null
  const cookieStore = await cookies()
  const cookieDeviceId = decryptDeviceId(cookieStore.get(DEVICE_ID_COOKIE_NAME)?.value)
  const userId = await getSessionUserId()

  const resolvedDeviceId = await resolveDeviceIdBeforeFingerprint(userId, storedDeviceId, cookieDeviceId, trustworthyIp)
  if (!resolvedDeviceId && fingerprint === null) return { needsFingerprint: true }

  const fingerprintDeviceId = resolvedDeviceId || !fingerprint ? null : await resolveDeviceIdFromFingerprint(fingerprint)
  const deviceId = resolvedDeviceId ?? fingerprintDeviceId ?? createDeviceId()
  const visitorDayEnd = getVisitorDayEnd(timezone)

  await syncDeviceIdLayers({ deviceId, userId, cookieDeviceId, trustworthyIp, fingerprint, visitorDayEnd })
  await insertDBVisitOncePerDay(deviceId, searchParams, pageUrl, getVisitorDayStart(timezone))

  return { storedDeviceId: encodeDeviceId(deviceId) }
}
