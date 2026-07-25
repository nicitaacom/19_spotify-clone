"use client"

import { useEffect } from "react"
import { HiOutlineWifi } from "react-icons/hi"

import useOnlineStatus from "@/hooks/useOnlineStatus"

const OfflineProvider = () => {
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return

    const registerServiceWorker = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(error => {
        console.error("[offline] service worker registration failed", error)
      })
    }

    if (document.readyState === "complete") registerServiceWorker()
    else window.addEventListener("load", registerServiceWorker, { once: true })

    return () => window.removeEventListener("load", registerServiceWorker)
  }, [])

  useEffect(() => {
    if (isOnline) return

    const preventOfflineNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return

      const anchor = event.target.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener("click", preventOfflineNavigation, true)
    return () => window.removeEventListener("click", preventOfflineNavigation, true)
  }, [isOnline])

  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/30 bg-neutral-950/95 px-4 py-2 text-xs font-medium text-amber-300 shadow-xl backdrop-blur">
      <HiOutlineWifi size={16} />
      You&apos;re offline. This page will stay open; reconnect before changing pages.
    </div>
  )
}

export default OfflineProvider
