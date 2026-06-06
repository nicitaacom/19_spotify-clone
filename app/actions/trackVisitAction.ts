"use server"

import { headers } from "next/headers"

import { supabaseAdmin } from "@/libs/supabaseAdmin"

const extractUTMParams = (searchParams: { [key: string]: string | string[] | undefined } = {}) => ({
  source: Array.isArray(searchParams.utm_source) ? searchParams.utm_source[0] : searchParams.utm_source,
  medium: Array.isArray(searchParams.utm_medium) ? searchParams.utm_medium[0] : searchParams.utm_medium,
  campaign: Array.isArray(searchParams.utm_campaign) ? searchParams.utm_campaign[0] : searchParams.utm_campaign,
})

export async function trackVisitAction(
  userId: string | undefined,
  searchParams: { [key: string]: string | string[] | undefined } = {},
  currentUrl = "/",
) {
  if (!userId) return
  const utmParams = extractUTMParams(searchParams)
  const hasUTMParams = Object.values(utmParams).some(param => param !== undefined)

  const today = new Date().toISOString().split("T")[0]
  const { data: recentVisit } = await supabaseAdmin
    .from("utm_stats")
    .select("id, created_at")
    .eq("user_id", userId)
    .gte("created_at", `${today}T00:00:00.000Z`)
    .lte("created_at", `${today}T23:59:59.999Z`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recentVisit) return

  const finalParams = hasUTMParams
    ? utmParams
    : {
        source: "organic",
        medium: "direct",
        campaign: undefined,
      }

  const userAgent = (await headers()).get("user-agent") ?? "unknown"
  const insertError = await insertDBUTMVisitAction(userId, finalParams, userAgent, currentUrl)
  if (typeof insertError === "string") console.error("UTM insert failed:", insertError)
}

interface UTMParams {
  source?: string
  medium?: string
  campaign?: string
}

async function insertDBUTMVisitAction(userId: string, utmParams: UTMParams, userAgent: string | null, currentUrl: string) {
  try {
    const { error } = await supabaseAdmin.from("utm_stats").insert({
      user_id: userId,
      source: utmParams.source,
      medium: utmParams.medium,
      campaign: utmParams.campaign,
      url: currentUrl,
      user_agent: userAgent,
    })
    if (error) throw Error(error.message)
  } catch (error) {
    return `Error tracking UTM visit: ${error instanceof Error ? error.message : "Unknown error"}`
  }
}
