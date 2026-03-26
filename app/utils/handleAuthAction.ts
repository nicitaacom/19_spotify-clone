"use client"

import useAuthModal from "@/hooks/useAuthModal"
import { isIframeAuthFromSearch } from "@/app/utils/isIframeAuth"

type HandleAuthActionParams = {
  isIframe: boolean
}

export const shouldUseExternalAuth = ({ isIframe }: HandleAuthActionParams) => {
  if (typeof window === "undefined") {
    return false
  }

  const shouldUseIframeAuth = isIframe || isIframeAuthFromSearch(window.location.search)

  try {
    return shouldUseIframeAuth && window.self !== window.top
  } catch {
    return shouldUseIframeAuth
  }
}

export const getProductionAuthUrl = () => {
  const baseUrl =
    process.env.NEXT_PUBLIC_PRODUCTION_URL ?? (typeof window !== "undefined" ? window.location.origin : null)

  if (!baseUrl) {
    return null
  }

  const normalizedBaseUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`
  const authUrl = new URL(normalizedBaseUrl)

  authUrl.searchParams.set("is_iframe", "true")

  return authUrl.toString()
}

export const handleAuthAction = ({ isIframe }: HandleAuthActionParams) => {
  if (typeof window === "undefined") {
    return
  }

  const shouldOpenExternalAuth = shouldUseExternalAuth({ isIframe })

  if (shouldOpenExternalAuth) {
    const authUrl = getProductionAuthUrl()

    if (authUrl) {
      window.open(authUrl, "_blank", "noopener,noreferrer")
      return
    }
  }

  const { onOpen } = useAuthModal.getState()
  onOpen()
}
