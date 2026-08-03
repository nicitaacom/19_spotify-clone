"use client"

import { RefObject, useCallback, useEffect, useRef, useState } from "react"

interface UseVerifyHumanOptions {
  isEnabled?: boolean
}

export const useVerifyHuman = (
  turnstileRef: RefObject<HTMLDivElement | null>,
  { isEnabled = true }: UseVerifyHumanOptions = {},
) => {
  const widgetIdRef = useRef<string | null>(null)
  const isDev = process.env.NODE_ENV !== "production"
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  const [isVerified, setIsVerified] = useState(isDev)
  const [token, setToken] = useState(isDev ? "dev-token" : "")

  const clearVerificationFn = useCallback(() => {
    const isDev = process.env.NODE_ENV !== "production"
    setIsVerified(isDev)
    setToken(isDev ? "dev-token" : "")
  }, [])

  const resetTurnstileFn = useCallback(() => {
    clearVerificationFn()

    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [clearVerificationFn])

  useEffect(() => {
    if (isDev || !isEnabled || !siteKey) {
      if (!isDev) {
        clearVerificationFn()
      }

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }

      if (turnstileRef.current) {
        turnstileRef.current.innerHTML = ""
      }

      return
    }

    let isCancelled = false
    // copied here so the cleanup below clears the element this effect actually rendered into, rather
    // than whatever turnstileRef points at by the time the cleanup runs
    const turnstileElement = turnstileRef.current

    const renderTurnstileFn = () => {
      if (isCancelled || !turnstileRef.current || !window.turnstile || widgetIdRef.current) {
        return false
      }

      turnstileRef.current.innerHTML = ""
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: verifiedToken => {
          setToken(verifiedToken)
          setIsVerified(true)
        },
        "error-callback": clearVerificationFn,
        "expired-callback": clearVerificationFn,
      })

      return true
    }

    const intervalId = renderTurnstileFn()
      ? null
      : window.setInterval(() => {
          if (renderTurnstileFn()) {
            window.clearInterval(intervalId!)
          }
        }, 250)

    return () => {
      isCancelled = true

      if (intervalId) {
        window.clearInterval(intervalId)
      }

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }

      if (turnstileElement) {
        turnstileElement.innerHTML = ""
      }

      clearVerificationFn()
    }
  }, [clearVerificationFn, isDev, isEnabled, siteKey, turnstileRef])

  return {
    isVerified,
    token,
    resetTurnstileFn,
    shouldRenderChallenge: isEnabled && !!siteKey && !isDev,
  }
}
