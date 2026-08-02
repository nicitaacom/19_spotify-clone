"use client"

import { useEffect } from "react"

import { computeFingerprint } from "@/app/utils/computeFingerprint"
import { trackVisitAction } from "@/app/actions/trackVisitAction"
import { useDeviceIdStore } from "@/store/user/useDeviceIdStore"

const UTM_PARAM_NAMES = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]

export function UTMTracker() {
  useEffect(() => {
    const params = Object.fromEntries(new URLSearchParams(window.location.search).entries())
    const currentUrl = window.location.href
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"

    // a refresh must not re-attribute the visit, so the params leave the address bar once they are sent
    function stripUTMParamsFromUrl() {
      const remainingParams = new URLSearchParams(window.location.search)
      for (const utmParamName of UTM_PARAM_NAMES) remainingParams.delete(utmParamName)

      const search = remainingParams.toString()
      const url = window.location.origin + window.location.pathname + (search ? `?${search}` : "")
      window.history.replaceState({}, "", url)
    }

    // even with no UTM params the visit is still tracked, as organic / direct
    async function trackVisit() {
      const { storedDeviceId, setStoredDeviceId } = useDeviceIdStore.getState()

      // phase 1 - layer 1 sends what localStorage holds, the server tries layers 1-3 and answers
      const trackVisitResp = await trackVisitAction(storedDeviceId, params, currentUrl, timezone)
      if ("storedDeviceId" in trackVisitResp) {
        setStoredDeviceId(trackVisitResp.storedDeviceId)
        return
      }

      // phase 2 - layers 1-3 all missed, so the canvas + WebGL reads happen here and only here.
      // "" tells the server the browser gave nothing, so it mints a new id instead of asking again.
      const fingerprint = await computeFingerprint().catch(() => "")
      const fingerprintTrackVisitResp = await trackVisitAction(storedDeviceId, params, currentUrl, timezone, fingerprint)
      if ("storedDeviceId" in fingerprintTrackVisitResp) setStoredDeviceId(fingerprintTrackVisitResp.storedDeviceId)
    }

    trackVisit()
      .catch(error => console.error("UTMTracker trackVisitAction failed - no utm_stats row for this visit", error))
      .finally(stripUTMParamsFromUrl)
  }, [])

  return null
}
