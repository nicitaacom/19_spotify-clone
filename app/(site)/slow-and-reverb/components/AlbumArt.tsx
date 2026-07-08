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

// Bass-reactive motion (vizzy.io style): a kick pushes `env` up fast and it
// eases back down, driving a subtle scale + blur pulse. Kept gentle. This runs
// on an OUTER wrapper so it composes with the CSS ken-burns drift on the <img>.
const MAX_SCALE = 0.06 // +6% at a full-energy kick
const MAX_BLUR = 4 // px at a full-energy kick
const ATTACK = 0.5 // how fast env rises toward a louder level
const DECAY = 0.08 // how fast env falls when the level drops

/**
 * Full-bleed background image built from the uploaded track's embedded cover.
 * Fills the page shell (which must be `relative`) behind all content. A slow
 * ken-burns drift plays on the image while playing + pitched down; on top, the
 * whole layer pulses (scale + blur) with the low-end. Brightness tracks pitch
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

    // When not playing, ease the pulse back to rest and stop the loop.
    if (!isPlaying) {
      envRef.current = 0
      wrap.style.transform = "scale(1)"
      wrap.style.filter = "none"
      return
    }

    const tick = () => {
      const level = getBassLevel() // 0..1
      const env = envRef.current
      // Asymmetric follower: quick attack on louder hits, slow release.
      const coeff = level > env ? ATTACK : DECAY
      const next = env + (level - env) * coeff
      envRef.current = next

      const scale = 1 + next * MAX_SCALE
      const blur = next * MAX_BLUR
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
