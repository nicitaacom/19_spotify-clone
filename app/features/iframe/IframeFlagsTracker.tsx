"use client"

import { useEffect } from "react"

import { readIsPlayOnPhone } from "@/hooks/usePlayOnPhone"
import { isIframeAuthInThisTab } from "@/app/utils/isIframeAuth"

// Reads both iframe flags on the very first page, so they stick for the whole life of the iframe
// (app/utils/stickyQueryFlag.ts). Needed because their own readers come late: usePlayOnPhone lives in the
// player, which mounts only once a song plays - and by then a click on a playlist has already replaced
// `/?playOnPhone=1&is_iframe=true` with `/playlists/<slug>`, so the player saw an empty query and the
// laptop played the song (2026-11-02, headless check against the live site: playOnPhone stored = null).
export function IframeFlagsTracker() {
  useEffect(() => {
    readIsPlayOnPhone()
    isIframeAuthInThisTab()
  }, [])

  return null
}
