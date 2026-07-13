"use client"

import { useEffect, useRef } from "react"

interface AlbumArtProps {
  albumArtUrl: string | null
  pitchEnabled: boolean
  pitchSemitones: number
  isPlaying: boolean
  getKickLevel: () => number
}

// Base darkening so the album art works as a readable page background (like
// the `brightness-[40%]` reference). Pitch modulates on top of this.
const BASE_BRIGHTNESS = 0.4

// Kick-reactive motion. The onset detection lives in the engine (lib/kickDetector.ts):
// getKickLevel() already returns a ready 0..1 onset strength — 0 on non-kick frames,
// energy-relative so it's song-independent and blind to hats/claps. This component only
// ANIMATES it: ease up on a hit (attack), then smoothly release back to rest (decay).
// The image RESTS at 0.94 and a kick pushes it UP toward 1.0 — it never scales ABOVE 1.0,
// so an `inset-0` background can't overflow its container (which was causing page scroll).
const REST_SCALE = 0.97 // scale at rest / between kicks (gentle swing)
const KICK_RANGE = 0.03 // a full-strength kick adds this (0.97 → 1.0 exactly, never past)
const MAX_BLUR = 1.5 // px at a full-strength kick
// A kick eases UP over ATTACK, then back DOWN over DECAY — the whole gesture ≈ 150ms
// (frame-rate independent, see tick). Larger tau = slower/softer motion.
const ATTACK_TAU_MS = 55
const DECAY_TAU_MS = 95

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
  getKickLevel,
}: AlbumArtProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const envRef = useRef(0) // displayed pulse (0..1), eases toward targetRef
  const targetRef = useRef(0) // pulse target set by a kick, itself releases over time
  const prevTsRef = useRef<number | null>(null)
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
      targetRef.current = 0
      prevTsRef.current = null
      wrap.style.transition = "transform 300ms ease-out, filter 300ms ease-out"
      wrap.style.transform = `scale(${REST_SCALE})`
      wrap.style.filter = "none"
      return
    }

    // No CSS transition while running — the rAF loop drives every frame itself,
    // otherwise the pulse would lag the beat by 300ms.
    wrap.style.transition = "none"

    const tick = (now: DOMHighResTimeStamp) => {
      const hit = getKickLevel() // 0..1 onset strength (0 on non-kick frames)
      if (hit > targetRef.current) targetRef.current = hit // a kick raises the target

      const dt = prevTsRef.current === null ? 16.7 : now - prevTsRef.current
      prevTsRef.current = now

      // Target releases over time; the displayed env EASES toward it. Rising toward a
      // fresh kick uses the (fast) attack tau, settling back uses the (slower) decay tau —
      // so a kick smoothly swells and falls (~150ms) instead of snapping. Time-based, so
      // the feel is identical at 60 or 144 Hz.
      targetRef.current *= Math.exp(-dt / DECAY_TAU_MS)
      const tau = targetRef.current > envRef.current ? ATTACK_TAU_MS : DECAY_TAU_MS
      const k = 1 - Math.exp(-dt / tau)
      envRef.current += (targetRef.current - envRef.current) * k
      const env = envRef.current

      const scale = REST_SCALE + env * KICK_RANGE
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
  }, [isPlaying, getKickLevel])

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
        // Base overfill (scale 1.12) so that when the wrapper shrinks to REST_SCALE on a
        // kick-driven pulse, the image still covers the container with no dark margin
        // (0.94 × 1.12 ≈ 1.05). When drifting, animate-kenburns owns the transform instead.
        style={{
          filter: `brightness(${brightness})`,
          transition: "filter 300ms",
          ...(shouldDrift ? {} : { transform: "scale(1.12)" }),
        }}
      />
    </div>
  )
}
