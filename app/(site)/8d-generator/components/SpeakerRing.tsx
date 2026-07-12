"use client"

import { useRef, useEffect } from "react"
import { HiSpeakerWave, HiSpeakerXMark } from "react-icons/hi2"

import { SPEAKERS } from "../lib/speakers"

interface SpeakerRingProps {
  isPlaying: boolean
  getOrbitAngle: () => number
  getCurrentGains: () => number[]
  mixerVolumes: number[]
}

// Radii as a fraction of the square container.
const CHIP_RADIUS = 0.46
const DOT_RADIUS = 0.4

const SpeakerRing = ({ isPlaying, getOrbitAngle, getCurrentGains, mixerVolumes }: SpeakerRingProps) => {
  const chipRefs = useRef<(HTMLDivElement | null)[]>([])
  const dotRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isPlaying) {
      // Reset chips to rest (no glow) and hide the dot when paused/idle.
      chipRefs.current.forEach((el) => {
        if (!el) return
        el.style.boxShadow = "none"
        el.style.borderColor = ""
      })
      if (dotRef.current) dotRef.current.style.opacity = "0"
      return
    }

    const tick = () => {
      const gains = getCurrentGains()
      chipRefs.current.forEach((el, i) => {
        if (!el) return
        const g = gains[i] ?? 0
        el.style.boxShadow = g > 0.001 ? `0 0 ${12 * g}px rgba(74,222,128,${0.6 * g})` : "none"
        el.style.borderColor = g > 0.001 ? `rgba(74,222,128,${0.5 * g})` : ""
      })

      const dot = dotRef.current
      if (dot) {
        const rad = ((getOrbitAngle() - 90) * Math.PI) / 180 // -90 so 0° maps to the top
        const x = 50 + DOT_RADIUS * 100 * Math.cos(rad)
        const y = 50 + DOT_RADIUS * 100 * Math.sin(rad)
        dot.style.left = `${x}%`
        dot.style.top = `${y}%`
        dot.style.opacity = "1"
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isPlaying, getOrbitAngle, getCurrentGains])

  return (
    <div className="relative w-full max-w-[420px] aspect-square mx-auto">
      {/* rings (echo the DTS turntable look — dark and subtle) */}
      <div className="absolute inset-4 rounded-full border border-white/10" />
      <div className="absolute inset-16 rounded-full border border-white/5" />

      {/* center decorative label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-neutral-600 text-xs uppercase tracking-widest">8D</span>
      </div>

      {/* orbit dot */}
      <div
        ref={dotRef}
        className="absolute w-3 h-3 rounded-full bg-neon shadow-neon-sm -translate-x-1/2 -translate-y-1/2 opacity-0"
        style={{ left: "50%", top: "10%" }}
      />

      {/* 8 speaker chips positioned on the ring circumference */}
      {SPEAKERS.map((sp, i) => {
        const rad = ((sp.angleDeg - 90) * Math.PI) / 180 // -90 so front (0°) is at the top
        const left = 50 + CHIP_RADIUS * 100 * Math.cos(rad)
        const top = 50 + CHIP_RADIUS * 100 * Math.sin(rad)
        const muted = mixerVolumes[i] === 0
        const Icon = muted ? HiSpeakerXMark : HiSpeakerWave
        return (
          <div
            key={sp.id}
            className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${left}%`, top: `${top}%` }}>
            <div
              ref={(el) => {
                chipRefs.current[i] = el
              }}
              className={`w-12 h-12 rounded-lg bg-elevated border border-white/10 flex items-center justify-center transition-opacity ${
                muted ? "opacity-40" : ""
              }`}>
              <Icon className="text-neutral-300" size={18} />
            </div>
            <span className="text-[9px] text-neutral-500 uppercase tracking-wide whitespace-nowrap">
              {sp.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default SpeakerRing
