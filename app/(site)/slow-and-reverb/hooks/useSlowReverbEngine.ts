"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "react-hot-toast"

import { buildEffectsGraph, EffectsParams } from "../lib/buildEffectsGraph"

export interface SlowReverbEngine {
  loadFile(file: File): Promise<void>
  fileName: string | null
  buffer: AudioBuffer | null
  duration: number
  isPlaying: boolean
  getPosition(): number
  togglePlay(): void
  seek(seconds: number): void
  speed: number
  setSpeed(v: number): void
  reverb: number
  setReverb(v: number): void
  bass: number
  setBass(v: number): void
  applyPreset(p: "slowed" | "nightcore"): void
  isRendering: boolean
  download(format: "mp3" | "wav"): Promise<void>
}

export function useSlowReverbEngine(): SlowReverbEngine {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [reverb, setReverbState] = useState(0)
  const [bass, setBassState] = useState(0)
  const [isRendering, setIsRendering] = useState(false)

  // Audio engine refs
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const lowshelfRef = useRef<BiquadFilterNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)

  const generationRef = useRef(0)
  const pausedOffsetSecRef = useRef(0)
  const startCtxTimeRef = useRef(0)
  const startOffsetSecRef = useRef(0)

  const speedRef = useRef(1)
  const reverbRef = useRef(0)
  const bassRef = useRef(0)
  const isPlayingRef = useRef(false)
  const bufferRef = useRef<AudioBuffer | null>(null)

  // Sync refs with state
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  useEffect(() => {
    reverbRef.current = reverb
  }, [reverb])
  useEffect(() => {
    bassRef.current = bass
  }, [bass])
  useEffect(() => {
    bufferRef.current = buffer
  }, [buffer])
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const stopCurrent = useCallback(() => {
    const src = sourceRef.current
    if (src) {
      try {
        src.stop()
      } catch {}
      try {
        src.disconnect()
      } catch {}
    }
    const ls = lowshelfRef.current
    if (ls) {
      try {
        ls.disconnect()
      } catch {}
    }
    const wg = wetGainRef.current
    if (wg) {
      try {
        wg.disconnect()
      } catch {}
    }
    const dg = dryGainRef.current
    if (dg) {
      try {
        dg.disconnect()
      } catch {}
    }
    sourceRef.current = null
    lowshelfRef.current = null
    wetGainRef.current = null
    dryGainRef.current = null
  }, [])

  const getPosition = useCallback((): number => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return pausedOffsetSecRef.current
    if (!isPlayingRef.current) return pausedOffsetSecRef.current
    const elapsed = (ctx.currentTime - startCtxTimeRef.current) * speedRef.current
    const pos = startOffsetSecRef.current + elapsed
    return Math.max(0, Math.min(pos, buf.duration))
  }, [])

  const playFromOffset = useCallback((offsetSec: number) => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return

    stopCurrent()

    const params: EffectsParams = {
      speed: speedRef.current,
      reverb: reverbRef.current,
      bass: bassRef.current,
    }

    const graph = buildEffectsGraph(ctx, buf, params)
    sourceRef.current = graph.source
    lowshelfRef.current = graph.lowshelf
    wetGainRef.current = graph.wetGain
    dryGainRef.current = graph.dryGain

    const now = ctx.currentTime
    startCtxTimeRef.current = now
    startOffsetSecRef.current = Math.max(0, Math.min(offsetSec, buf.duration))

    const gen = ++generationRef.current

    graph.source.onended = () => {
      if (generationRef.current !== gen) return
      isPlayingRef.current = false
      setIsPlaying(false)
      pausedOffsetSecRef.current = 0
      sourceRef.current = null
    }

    try {
      graph.source.start(0, startOffsetSecRef.current)
      isPlayingRef.current = true
      setIsPlaying(true)
    } catch (err) {
      console.error("Playback start failed", err)
      toast.error("Playback error")
    }
  }, [stopCurrent])

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/")) {
      toast.error("Unsupported or corrupted audio file")
      return
    }

    try {
      // Close previous context
      if (ctxRef.current) {
        stopCurrent()
        try {
          await ctxRef.current.close()
        } catch {}
        ctxRef.current = null
      }

      const arrayBuffer = await file.arrayBuffer()
      const AudioCtx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
        AudioContext
      const ctx = new AudioCtx()
      ctxRef.current = ctx

      const decoded = await ctx.decodeAudioData(arrayBuffer)

      stopCurrent()
      pausedOffsetSecRef.current = 0
      startOffsetSecRef.current = 0
      startCtxTimeRef.current = 0
      generationRef.current = 0
      isPlayingRef.current = false
      setIsPlaying(false)

      bufferRef.current = decoded
      setBuffer(decoded)
      setDuration(decoded.duration)
      setFileName(file.name)

      // keep speed/reverb/bass as-is
    } catch (err) {
      console.error("Decode failed", err)
      toast.error("Unsupported or corrupted audio file")
    }
  }, [stopCurrent])

  const togglePlay = useCallback(() => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return

    if (isPlayingRef.current) {
      const pos = getPosition()
      pausedOffsetSecRef.current = pos
      stopCurrent()
      isPlayingRef.current = false
      setIsPlaying(false)
    } else {
      ctx.resume().catch(() => {})
      const offset = pausedOffsetSecRef.current
      playFromOffset(offset)
    }
  }, [getPosition, playFromOffset, stopCurrent])

  const seek = useCallback(
    (seconds: number) => {
      const buf = bufferRef.current
      if (!buf) return
      const clamped = Math.max(0, Math.min(seconds, buf.duration))
      pausedOffsetSecRef.current = clamped
      if (isPlayingRef.current) {
        const ctx = ctxRef.current
        if (ctx) ctx.resume().catch(() => {})
        playFromOffset(clamped)
      }
      // if paused, getPosition will return the updated pausedOffset
    },
    [playFromOffset],
  )

  const setSpeed = useCallback((v: number) => {
    let clamped = Math.max(0.5, Math.min(1.5, v))
    clamped = Math.round(clamped * 20) / 20 // 0.05 step
    setSpeedState(clamped)
    speedRef.current = clamped

    const ctx = ctxRef.current
    if (isPlayingRef.current && sourceRef.current && ctx) {
      const pos = getPosition()
      startOffsetSecRef.current = pos
      startCtxTimeRef.current = ctx.currentTime
      sourceRef.current.playbackRate.setTargetAtTime(
        clamped,
        ctx.currentTime,
        0.03,
      )
    }
  }, [getPosition])

  const setReverb = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)))
    setReverbState(clamped)
    reverbRef.current = clamped

    const ctx = ctxRef.current
    if (isPlayingRef.current && wetGainRef.current && ctx) {
      wetGainRef.current.gain.setTargetAtTime(
        clamped / 100,
        ctx.currentTime,
        0.03,
      )
    }
  }, [])

  const setBass = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)))
    setBassState(clamped)
    bassRef.current = clamped

    const ctx = ctxRef.current
    if (isPlayingRef.current && lowshelfRef.current && ctx) {
      lowshelfRef.current.gain.setTargetAtTime(
        (clamped / 100) * 12,
        ctx.currentTime,
        0.03,
      )
    }
  }, [])

  const applyPreset = useCallback((p: "slowed" | "nightcore") => {
    if (p === "slowed") {
      setSpeed(0.8)
      setReverb(40)
      // bass untouched
    } else {
      setSpeed(1.25)
      setReverb(0)
    }
  }, [setSpeed, setReverb])

  const download = async (_format: "mp3" | "wav"): Promise<void> => {
    void _format
    // stub until Step 5
    setIsRendering(true)
    toast("Export coming in the next step")
    setIsRendering(false)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrent()
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {})
      }
    }
  }, [stopCurrent])

  return {
    loadFile,
    fileName,
    buffer,
    duration,
    isPlaying,
    getPosition,
    togglePlay,
    seek,
    speed,
    setSpeed,
    reverb,
    setReverb,
    bass,
    setBass,
    applyPreset,
    isRendering,
    download,
  }
}
