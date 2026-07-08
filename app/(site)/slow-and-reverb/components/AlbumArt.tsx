"use client"

import { useEffect, useRef } from "react"

interface AlbumArtProps {
  albumArtUrl: string | null
  pitchEnabled: boolean
  pitchSemitones: number
  isPlaying: boolean
  getBassLevel: () => number
}

// Base darkening so the album art works as a readable page background (like
// the `brightness-[40%]` reference). Pitch modulates on top of this.
const BASE_BRIGHTNESS = 0.4

// Kick-reactive motion (vizzy.io style). We react to the *onset* of a kick —
// the sudden RISE in low-end energy frame-to-frame (spectral flux), NOT the
// absolute bass volume — so sustained bass/808 tails don't keep it scaled up.
// Each detected transient injects into `env`, which then decays smoothly.
const MAX_SCALE = 0.07 // +7% at a full-strength kick
const MAX_BLUR = 4 // px at a full-strength kick
const FLUX_GAIN = 6 // amplify the rise so real kicks reach ~1
const FLUX_GATE = 0.015 // ignore tiny fluctuations (noise floor)
const DECAY = 0.12 // how fast the pulse eases back down each frame

/**
 * Full-bleed background image built from the uploaded track's embedded cover.
 * Fills the page shell (which must be `relative`) behind all content. A slow
 * ken-burns drift plays on the image while playing + pitched down; on top, the
 * whole layer punches (scale + blur) on kick onsets. Brightness tracks pitch
 * 1.5× more than the site background (§12.10.C).
 */
export default function AlbumArt({
  albumArtUrl,
  pitchEnabled,
  pitchSemitones,
  isPlaying,
  getBassLevel,
}: AlbumArtProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const envRef = useRef(0)
  const prevBassRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  // dim = st/12; art is 1.5× more sensitive than the site bg (slopes 0.9 / 0.15).
  const dim = pitchEnabled ? pitchSemitones / 12 : 0
  const pitchFactor = dim < 0 ? 1 + dim * 0.9 : 1 + dim * 0.15
  const brightness = BASE_BRIGHTNESS * pitchFactor

  // Slow ambient drift only while playing + pitched down.
  const shouldDrift = isPlaying && pitchEnabled && pitchSemitones <= -1

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    if (!isPlaying) {
      // Ease back to rest over 300ms, then stop the loop.
      envRef.current = 0
      prevBassRef.current = 0
      wrap.style.transition = "transform 300ms ease-out, filter 300ms ease-out"
      wrap.style.transform = "scale(1)"
      wrap.style.filter = "none"
      return
    }

    // No CSS transition while running — the rAF loop drives every frame itself,
    // otherwise the pulse would lag the beat by 300ms.
    wrap.style.transition = "none"

    const tick = () => {
      const bass = getBassLevel() // 0..1
      // Spectral flux: only the POSITIVE rise counts as a kick onset.
      const rise = bass - prevBassRef.current
      prevBassRef.current = bass
      if (rise > FLUX_GATE) {
        const hit = Math.min(1, rise * FLUX_GAIN)
        if (hit > envRef.current) envRef.current = hit
      }

      // Decay the pulse.
      envRef.current *= 1 - DECAY
      const env = envRef.current

      const scale = 1 + env * MAX_SCALE
      const blur = env * MAX_BLUR
      wrap.style.transform = `scale(${scale.toFixed(4)})`
      wrap.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none"

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isPlaying, getBassLevel])

  if (!albumArtUrl) return null

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden will-change-transform">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={albumArtUrl}
        alt="Background"
        className={`h-full w-full select-none object-cover object-center ${
          shouldDrift ? "animate-kenburns" : ""
        }`}
        style={{ filter: `brightness(${brightness})`, transition: "filter 300ms" }}
      />
    </div>
  )
}
