"use client"

import useAuthModal from "@/hooks/useAuthModal"

type HandleAuthActionParams = {
  isIframe: boolean
}

const getProductionAuthUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL

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

  if (isIframe) {
    const authUrl = getProductionAuthUrl()

    if (authUrl) {
      window.open(authUrl, "_blank", "noopener,noreferrer")
      return
    }
  }

  const { onOpen } = useAuthModal.getState()
  onOpen()
}
