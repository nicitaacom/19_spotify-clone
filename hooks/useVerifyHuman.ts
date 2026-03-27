"use client"

import { RefObject, useCallback, useEffect, useRef, useState } from "react"

interface UseVerifyHumanOptions {
  isEnabled?: boolean
}

export const useVerifyHuman = (
  turnstileRef: RefObject<HTMLDivElement>,
  { isEnabled = true }: UseVerifyHumanOptions = {},
) => {
  const widgetIdRef = useRef<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [token, setToken] = useState("")

  const clearVerificationFn = useCallback(() => {
    setIsVerified(false)
    setToken("")
  }, [])

  const resetTurnstileFn = useCallback(() => {
    clearVerificationFn()

    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [clearVerificationFn])

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY

    if (!isEnabled || !siteKey) {
      clearVerificationFn()

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

      if (turnstileRef.current) {
        turnstileRef.current.innerHTML = ""
      }

      clearVerificationFn()
    }
  }, [clearVerificationFn, isEnabled, turnstileRef])

  return {
    isVerified,
    token,
    resetTurnstileFn,
  }
}
