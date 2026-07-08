"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { FaPlay, FaPause } from "react-icons/fa"
import { twMerge } from "tailwind-merge"

import { formatTime } from "../lib/format"
import ProBadge from "./ProBadge"

interface WaveformProps {
  buffer: AudioBuffer | null
  duration: number
  isPlaying: boolean
  getPosition: () => number
  onSeek: (seconds: number) => void
  onTogglePlay: () => void
}

interface Peak {
  min: number
  max: number
}

const Waveform = ({
  buffer,
  duration,
  isPlaying,
  getPosition,
  onSeek,
  onTogglePlay,
}: WaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null) // the card (with padding)
  const innerRef = useRef<HTMLDivElement>(null) // unpadded wrapper for canvas measurement
  const peaksRef = useRef<Peak[]>([])
  const rafRef = useRef<number | null>(null)
  const lastDisplayTimeRef = useRef(0)

  const [currentTime, setCurrentTime] = useState(0)
  const [canvasWidth, setCanvasWidth] = useState(600)

  // Compute peaks based on actual width (dynamic bucket count)
  const computePeaks = useCallback((audioBuffer: AudioBuffer, width: number): Peak[] => {
    const channel = audioBuffer.getChannelData(0)
    const numBuckets = Math.max(40, Math.floor(width / 3)) // ~3px per bar (bar + gap)
    const bucketSize = Math.max(1, Math.floor(channel.length / numBuckets))
    const peaks: Peak[] = []

    for (let i = 0; i < numBuckets; i++) {
      let min = 1
      let max = -1
      const start = i * bucketSize
      const end = Math.min(start + bucketSize, channel.length)
      for (let j = start; j < end; j++) {
        const v = channel[j]
        if (v < min) min = v
        if (v > max) max = v
      }
      peaks.push({ min, max })
    }
    return peaks
  }, [])

  // Recompute peaks when buffer or canvasWidth changes
  useEffect(() => {
    if (buffer) {
      peaksRef.current = computePeaks(buffer, canvasWidth)
    } else {
      peaksRef.current = []
    }
  }, [buffer, canvasWidth, computePeaks])

  // Responsive canvas size — observe the *inner* unpadded container
  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    const updateSize = (w?: number) => {
      const measured = w ?? Math.max(300, inner.clientWidth || 600)
      setCanvasWidth(measured)
    }

    updateSize()

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect?.width || inner.clientWidth
        updateSize(Math.max(300, Math.floor(w)))
      }
    })
    ro.observe(inner)

    return () => ro.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d", { alpha: true })
    if (!canvas || !ctx || peaksRef.current.length === 0) return

    const dpr = window.devicePixelRatio || 1
    const cssW = canvasWidth
    const cssH = 96
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    // Do not override style.width beyond measured box; rely on parent + w-full
    canvas.style.height = `${cssH}px`
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cssW, cssH)

    const peaks = peaksRef.current
    const barCount = peaks.length
    const gap = 1
    const barWidth = Math.max(1, (cssW - (barCount - 1) * gap) / barCount)

    const pos = getPosition()
    const progress = duration > 0 ? Math.min(1, Math.max(0, pos / duration)) : 0
    const progressX = progress * cssW

    const centerY = cssH / 2

    // Pass 1: neutral bars
    ctx.fillStyle = "#525252"
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + gap)
      const p = peaks[i]
      const top = centerY - p.max * (centerY - 4)
      const bot = centerY - p.min * (centerY - 4)
      const h = Math.max(1, bot - top)
      ctx.fillRect(x, top, barWidth, h)
    }

    // Pass 2: progress neon clipped
    if (progressX > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, progressX, cssH)
      ctx.clip()

      ctx.fillStyle = "#4ade80"
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap)
        const p = peaks[i]
        const top = centerY - p.max * (centerY - 4)
        const bot = centerY - p.min * (centerY - 4)
        const h = Math.max(1, bot - top)
        ctx.fillRect(x, top, barWidth, h)
      }
      ctx.restore()
    }

    // Update display time throttled
    const now = performance.now()
    if (now - lastDisplayTimeRef.current > 250 || !isPlaying) {
      lastDisplayTimeRef.current = now
      setCurrentTime(pos)
    }
  }, [canvasWidth, duration, getPosition, isPlaying])

  // Animation loop only while playing
  useEffect(() => {
    const loop = () => {
      draw()
      if (isPlaying) {
        rafRef.current = requestAnimationFrame(loop)
      }
    }

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(loop)
    } else {
      draw()
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [isPlaying, draw])

  // Seek handlers — on the inner wrapper (avoids padding issues)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const fraction = Math.max(0, Math.min(1, x / rect.width))
    onSeek(fraction * duration)

    const move = (ev: PointerEvent) => {
      const r = rect
      const xx = ev.clientX - r.left
      const frac = Math.max(0, Math.min(1, xx / r.width))
      onSeek(frac * duration)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up, { once: true })
  }

  if (!buffer) {
    return null
  }

  const playIconClass = twMerge(
    "flex items-center justify-center w-12 h-12 rounded-full bg-neon text-black shadow-neon-sm hover:bg-neon-strong transition",
    isPlaying && "shadow-neon-sm",
  )

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative rounded-xl border border-white/5 bg-elevated p-4 shadow-[0_4px_12px_rgba(0,0,0,0.5)] overflow-hidden"
      >
        {/* Unpadded inner wrapper for accurate measurement and pointer events */}
        <div
          ref={innerRef}
          className="relative w-full overflow-hidden cursor-pointer select-none"
          onPointerDown={handlePointerDown}
        >
          <canvas ref={canvasRef} className="block w-full" />

          {/* centered play/pause overlay */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onTogglePlay()
            }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <div className={playIconClass}>
              {isPlaying ? <FaPause size={18} /> : <FaPlay size={18} className="ml-0.5" />}
            </div>
          </button>
        </div>
      </div>

      {/* time row */}
      <div className="flex items-center justify-between text-xs text-neutral-400 font-mono px-1">
        <span>{formatTime(currentTime)}</span>
        <ProBadge />
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}

export default Waveform
