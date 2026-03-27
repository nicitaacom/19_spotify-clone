"use client"

import { RefObject } from "react"

interface TurnstileChallengeProps {
  turnstileRef: RefObject<HTMLDivElement>
  isVerified: boolean
  className?: string
}

const TurnstileChallenge = ({ turnstileRef, isVerified, className }: TurnstileChallengeProps) => {
  if (!process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY) {
    return null
  }

  return (
    <div className={className}>
      <div className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Human verification</p>
          <p className="text-sm leading-6 text-white/70">
            Complete the Cloudflare challenge before continuing with auth or upload.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/8 bg-black/30 p-3">
          <div className="min-h-[66px]" ref={turnstileRef} />
        </div>

        <p className={`text-xs ${isVerified ? "text-emerald-300" : "text-amber-200"}`}>
          {isVerified ? "Verification complete. You can continue now." : "Complete the challenge to unlock the action button."}
        </p>
      </div>
    </div>
  )
}

export default TurnstileChallenge
