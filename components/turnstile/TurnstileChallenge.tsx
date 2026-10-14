"use client"

import type { RefObject } from "react"

interface TurnstileChallengeProps {
  turnstileRef: RefObject<HTMLDivElement | null>
}

const TurnstileChallenge = ({ turnstileRef }: TurnstileChallengeProps) => {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return null

  return <div ref={turnstileRef} className="mt-3 min-h-[66px] max-w-full" />
}

export default TurnstileChallenge
