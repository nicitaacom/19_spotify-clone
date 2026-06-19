"use client"

import { RefObject, useEffect } from "react"

interface TurnstileChallengeProps {
  turnstileRef: RefObject<HTMLDivElement | null>
  isVerified: boolean
  onDismiss?: () => void
}

const TurnstileChallenge = ({ turnstileRef, isVerified, onDismiss }: TurnstileChallengeProps) => {
  // Auto-dismiss 600ms after verification so the user sees the success state briefly
  useEffect(() => {
    if (!isVerified) return
    const t = setTimeout(() => onDismiss?.(), 600)
    return () => clearTimeout(t)
  }, [isVerified, onDismiss])

  if (!process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY) return null

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2.5">
        <div className="min-h-[66px]" ref={turnstileRef} />
      </div>
      <p className={`text-center text-xs ${isVerified ? "text-neon" : "text-amber-300/80"}`}>
        {isVerified ? "Verified ✓ — continuing…" : "Complete the challenge to continue."}
      </p>
    </div>
  )
}

export default TurnstileChallenge
