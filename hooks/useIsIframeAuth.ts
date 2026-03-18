"use client"

import { useEffect, useState } from "react"

import { isIframeAuthFromSearch } from "@/app/utils/isIframeAuth"

const getIsIframeAuth = () => {
  if (typeof window === "undefined") {
    return false
  }

  return isIframeAuthFromSearch(window.location.search)
}

const useIsIframeAuth = () => {
  const [isIframe, setIsIframe] = useState(getIsIframeAuth)

  useEffect(() => {
    setIsIframe(getIsIframeAuth())
  }, [])

  return isIframe
}

export default useIsIframeAuth
