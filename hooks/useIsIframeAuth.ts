"use client"

import { useSyncExternalStore } from "react"

import { isIframeAuthInThisTab } from "@/app/utils/isIframeAuth"

// sticky across the iframe's own navigation, not only the first URL - see stickyQueryFlag.ts
const getIsIframeAuth = () => isIframeAuthInThisTab()

const emptySubscribe = () => () => {}

const useIsIframeAuth = () => {
  return useSyncExternalStore(emptySubscribe, getIsIframeAuth, () => false)
}

export default useIsIframeAuth
