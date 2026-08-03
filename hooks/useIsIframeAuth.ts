"use client"

import { useSyncExternalStore } from "react"

import { isIframeAuthFromSearch } from "@/app/utils/isIframeAuth"

const getIsIframeAuth = () => isIframeAuthFromSearch(window.location.search)

const emptySubscribe = () => () => {}

const useIsIframeAuth = () => {
  return useSyncExternalStore(emptySubscribe, getIsIframeAuth, () => false)
}

export default useIsIframeAuth
