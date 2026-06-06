"use client"

import { RefObject, useEffect, useState } from "react"
import { createPortal } from "react-dom"

interface TurnstileChallengeProps {
  turnstileRef: RefObject<HTMLDivElement | null>
  isVerified: boolean
  className?: string
  onDismiss?: () => void
}

const TurnstileChallenge = ({ turnstileRef, isVerified, className, onDismiss }: TurnstileChallengeProps) => {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)

    return () => {
      setIsMounted(false)
    }
  }, [])

  if (!process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY) {
    return null
  }

  if (!isMounted) {
    return null
  }

  return createPortal(
    <div className={className}>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-neutral-950/88 px-4 py-5 backdrop-blur-md">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_38%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.14),transparent_32%)]" />
        <div className="relative w-full max-w-md space-y-4 rounded-[20px] border border-white/10 bg-neutral-900/95 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.5)] md:p-5">
          <div className="space-y-1.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/75">Human verification</p>
            <h2 className="text-2xl font-semibold text-white">Verify to continue</h2>
            <p className="text-sm leading-5 text-white/70">
              Complete the Cloudflare challenge in full screen before continuing with auth or upload.
            </p>
          </div>

          <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 p-2.5">
              <div className="min-h-[66px]" ref={turnstileRef} />
            </div>

            <p className={`text-center text-xs ${isVerified ? "text-emerald-300" : "text-amber-200"}`}>
              {isVerified
                ? "Verification complete. You can continue now."
                : "Complete the challenge to unlock the action buttons."}
            </p>
          </div>

          <div className="flex justify-center">
            <button
              className="rounded-full border border-white/12 px-4 py-1.5 text-sm text-white/70 transition hover:border-white/25 hover:text-white"
              onClick={onDismiss}
              type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default TurnstileChallenge
