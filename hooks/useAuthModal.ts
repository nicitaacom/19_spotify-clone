"use client"

import { create } from "zustand"

interface AuthModalStore {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}

const isIframeAuthFlow = () => {
  if (typeof window === "undefined") {
    return false
  }

  const searchParams = new URLSearchParams(window.location.search)

  return searchParams.get("is_iframe") === "true"
}

const getProductionAuthUrl = () => {
  if (typeof window === "undefined") {
    return null
  }

  const baseUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL

  if (!baseUrl) {
    return null
  }

  const normalizedBaseUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`
  const authUrl = new URL(normalizedBaseUrl)

  authUrl.searchParams.set("is_iframe", "true")

  return authUrl.toString()
}

const openProductionAuth = () => {
  if (typeof window === "undefined") {
    return false
  }

  const authUrl = getProductionAuthUrl()

  if (!authUrl) {
    return false
  }

  const authWindow = window.open("", "_blank", "noopener,noreferrer")

  if (!authWindow) {
    return false
  }

  authWindow.location.href = authUrl

  return true
}

const useAuthModal = create<AuthModalStore>(set => ({
  isOpen: false,
  onOpen: () => {
    if (isIframeAuthFlow() && openProductionAuth()) {
      return
    }

    set({ isOpen: true })
  },
  onClose: () => set({ isOpen: false }),
}))

export default useAuthModal
