"use client"

import { useCallback, useRef, useEffect } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { HiSpeakerWave } from "react-icons/hi2"

import { SPEAKERS } from "../lib/speakers"

interface SpeakerRingProps {
  enabled: boolean
  getCurrentGains: () => number[]
  getSourcePos: () => { angle: number; radius: number }
  mixerVolumes: number[]
  onInteractionStart: () => void
  onSourcePositionChange: (angle: number, radius: number) => void
}

// Chip radius as a fraction of the square container.
const CHIP_RADIUS = 0.46
const DOT_MAX_RADIUS = 0.4 // radius the source dot reaches at full spread

const SpeakerRing = ({
  enabled,
  getCurrentGains,
  getSourcePos,
  mixerVolumes,
  onInteractionStart,
  onSourcePositionChange,
}: SpeakerRingProps) => {
  const ringRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<(HTMLDivElement | null)[]>([])
  const dotRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const activePointerRef = useRef<number | null>(null)

  const setPositionFromCartesian = useCallback((x: number, screenY: number) => {
    const magnitude = Math.hypot(x, screenY)
    const scale = magnitude > 1 ? 1 / magnitude : 1
    const clampedX = x * scale
    const clampedY = screenY * scale
    const radius = Math.min(1, magnitude)
    const angle = ((Math.atan2(clampedX, -clampedY) * 180) / Math.PI + 360) % 360
    onSourcePositionChange(angle, radius)
  }, [onSourcePositionChange])

  const setPositionFromPointer = useCallback((clientX: number, clientY: number) => {
    const ring = ringRef.current
    if (!ring) return
    const rect = ring.getBoundingClientRect()
    const travelRadius = Math.min(rect.width, rect.height) * DOT_MAX_RADIUS
    if (travelRadius <= 0) return
    const x = (clientX - (rect.left + rect.width / 2)) / travelRadius
    const screenY = (clientY - (rect.top + rect.height / 2)) / travelRadius
    setPositionFromCartesian(x, screenY)
  }, [setPositionFromCartesian])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()
    onInteractionStart()
    activePointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus()
    setPositionFromPointer(event.clientX, event.clientY)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    setPositionFromPointer(event.clientX, event.clientY)
  }

  const finishPointerInteraction = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activePointerRef.current = null
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isArrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    if (!isArrow && event.key !== "Home") return

    event.preventDefault()
    onInteractionStart()

    if (event.key === "Home") {
      onSourcePositionChange(0, 0)
      return
    }

    const { angle, radius } = getSourcePos()
    const rad = (angle * Math.PI) / 180
    let x = Math.sin(rad) * radius
    let screenY = -Math.cos(rad) * radius
    const step = event.shiftKey ? 0.01 : 0.05

    if (event.key === "ArrowUp") screenY -= step
    if (event.key === "ArrowDown") screenY += step
    if (event.key === "ArrowLeft") x -= step
    if (event.key === "ArrowRight") x += step
    setPositionFromCartesian(x, screenY)
  }

  useEffect(() => {
    const tick = () => {
      const gains = getCurrentGains()
      const on = enabled
      chipRefs.current.forEach((el, i) => {
        if (!el) return
        const g = on ? gains[i] ?? 0 : 0
        el.style.boxShadow = g > 0.001 ? `0 0 ${12 * g}px rgba(74,222,128,${0.6 * g})` : "none"
        el.style.borderColor = g > 0.001 ? `rgba(74,222,128,${0.5 * g})` : ""
      })

      const dot = dotRef.current
      if (dot) {
        const { angle, radius } = getSourcePos()
        if (radius > 0.001) {
          const rad = ((angle - 90) * Math.PI) / 180 // -90 so 0° is at the top
          const r = DOT_MAX_RADIUS * radius * 100
          dot.style.left = `${50 + r * Math.cos(rad)}%`
          dot.style.top = `${50 + r * Math.sin(rad)}%`
        } else {
          dot.style.left = "50%"
          dot.style.top = "50%"
        }
        dot.style.opacity = on ? "1" : "0.35"
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [enabled, getCurrentGains, getSourcePos])

  return (
    <div
      ref={ringRef}
      role="group"
      tabIndex={0}
      aria-label="8D source position. Drag or use arrow keys to move; hold Shift for fine movement; press Home to center."
      className="relative w-full max-w-[420px] aspect-square mx-auto touch-none select-none cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/70 focus-visible:ring-offset-2 focus-visible:ring-offset-elevated rounded-full"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={finishPointerInteraction}
      onKeyDown={handleKeyDown}>
      {/* rings — dark and subtle */}
      <div className="absolute inset-4 rounded-full border border-white/10" />
      <div className="absolute inset-16 rounded-full border border-white/5" />

      {/* center decorative label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-neutral-600 text-xs uppercase tracking-widest">8D</span>
      </div>

      {/* single 8D source dot at the weighted position */}
      <div
        ref={dotRef}
        className="absolute z-10 w-3.5 h-3.5 rounded-full bg-neon shadow-neon-sm -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity pointer-events-none"
        style={{ left: "50%", top: "50%" }}
      />

      {/* 8 speaker chips positioned on the ring circumference */}
      {SPEAKERS.map((sp, i) => {
        const rad = ((sp.angleDeg - 90) * Math.PI) / 180 // -90 so front (0°) is at the top
        const left = 50 + CHIP_RADIUS * 100 * Math.cos(rad)
        const top = 50 + CHIP_RADIUS * 100 * Math.sin(rad)
        const active = enabled && mixerVolumes[i] > 0
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
                active ? "" : "opacity-50"
              }`}>
              <HiSpeakerWave className={active ? "text-neon" : "text-neutral-400"} size={18} />
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
