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

const openProductionAuth = () => {
  if (typeof window === "undefined") {
    return false
  }

  const authUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL

  if (!authUrl) {
    return false
  }

  const normalizedAuthUrl = authUrl.startsWith("http") ? authUrl : `https://${authUrl}`

  window.open(normalizedAuthUrl, "_blank", "noopener,noreferrer")

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
