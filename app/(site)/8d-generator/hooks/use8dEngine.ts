"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "react-hot-toast"

import { extractAlbumArt } from "../../slow-and-reverb/lib/id3AlbumArt"
import { build8dGraph, EightDParams } from "../lib/build8dGraph"
import { SPEAKER_COUNT, orbitGains, orbitAngle } from "../lib/speakers"
import { renderOffline8d } from "../lib/renderOffline8d"
import { encodeMp3 } from "../../slow-and-reverb/lib/encodeMp3"

export const DEFAULT_ROTATION_PERIOD = 8
const ORBIT_SMOOTH = 0.05 // s — time constant for the 60Hz orbit-gain ramps (clickless)
const MIXER_SMOOTH = 0.03 // s — time constant for live mixer-slider changes

export interface EightDEngine {
  loadFile(file: File): Promise<void>
  clear(): void
  fileName: string | null
  albumArtUrl: string | null
  buffer: AudioBuffer | null
  duration: number
  isPlaying: boolean
  getPosition(): number
  getOrbitAngle(): number
  getCurrentGains(): number[]
  togglePlay(): void
  seek(seconds: number): void
  rotationPeriod: number
  setRotationPeriod(v: number): void
  direction: 1 | -1
  setDirection(v: 1 | -1): void
  mixerVolumes: number[]
  setMixerVolume(i: number, v: number): void // 0–100 in UI, /100 in graph
  resetMixers(): void
  isRendering: boolean
  download(): Promise<void>
}

export function use8dEngine(): EightDEngine {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [rotationPeriod, setRotationPeriodState] = useState(DEFAULT_ROTATION_PERIOD)
  const [direction, setDirectionState] = useState<1 | -1>(1)
  const [mixerVolumes, setMixerVolumes] = useState<number[]>(() =>
    new Array<number>(SPEAKER_COUNT).fill(100),
  )
  const [isRendering, setIsRendering] = useState(false)
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)

  // Audio engine refs
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const orbitGainsRef = useRef<GainNode[] | null>(null)
  const userGainsRef = useRef<GainNode[] | null>(null)
  const masterRef = useRef<GainNode | null>(null)

  const generationRef = useRef(0)
  const pausedOffsetSecRef = useRef(0)
  const startCtxTimeRef = useRef(0)
  const startOffsetSecRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  // Phase offset (degrees) kept so changing rotationPeriod/direction mid-play does not
  // make the orbit angle jump — see §4.3.4. Reset to 0 on seek / new file. Export always
  // renders with phase 0 (locked decision), so the offline curve ignores this ref.
  const phaseOffsetRef = useRef(0)

  const rotationPeriodRef = useRef(DEFAULT_ROTATION_PERIOD)
  const directionRef = useRef<1 | -1>(1)
  const mixerVolumesRef = useRef<number[]>(new Array<number>(SPEAKER_COUNT).fill(100))
  const isPlayingRef = useRef(false)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const albumArtUrlRef = useRef<string | null>(null)

  useEffect(() => { bufferRef.current = buffer }, [buffer])
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  const getPosition = useCallback((): number => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return pausedOffsetSecRef.current
    if (!isPlayingRef.current) return pausedOffsetSecRef.current
    const elapsed = ctx.currentTime - startCtxTimeRef.current
    const pos = startOffsetSecRef.current + elapsed
    return Math.max(0, Math.min(pos, buf.duration))
  }, [])

  // Current orbit angle (degrees), including the phase offset. rAF-safe (reads refs only).
  const getOrbitAngle = useCallback((): number => {
    return (
      phaseOffsetRef.current +
      orbitAngle(getPosition(), rotationPeriodRef.current, directionRef.current)
    )
  }, [getPosition])

  // orbitGains(angle) × mixerVolume/100 per speaker — for the SpeakerRing glow. rAF-safe.
  const getCurrentGains = useCallback((): number[] => {
    if (!isPlayingRef.current) return new Array<number>(SPEAKER_COUNT).fill(0)
    const g = orbitGains(getOrbitAngle())
    const vols = mixerVolumesRef.current
    return g.map((v, i) => v * (vols[i] / 100))
  }, [getOrbitAngle])

  const stopOrbitLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const stopCurrent = useCallback(() => {
    stopOrbitLoop()
    const src = sourceRef.current
    if (src) {
      // Detach onended BEFORE stopping (see useSlowReverbEngine §12.3): a manual stop
      // (pause / seek / new-file) must never run the natural-end handler, which resets
      // pausedOffsetSecRef to 0 — that would make resume/seek jump back to the start.
      src.onended = null
      try { src.stop() } catch {}
      try { src.disconnect() } catch {}
    }
    orbitGainsRef.current?.forEach((n) => { try { n.disconnect() } catch {} })
    userGainsRef.current?.forEach((n) => { try { n.disconnect() } catch {} })
    if (masterRef.current) { try { masterRef.current.disconnect() } catch {} }
    sourceRef.current = null
    orbitGainsRef.current = null
    userGainsRef.current = null
    masterRef.current = null
  }, [stopOrbitLoop])

  const runOrbitLoop = useCallback(() => {
    const tick = () => {
      const ctx = ctxRef.current
      const orbitNodes = orbitGainsRef.current
      if (!ctx || !orbitNodes || !isPlayingRef.current) {
        rafRef.current = null
        return
      }
      const g = orbitGains(getOrbitAngle())
      const now = ctx.currentTime
      for (let i = 0; i < SPEAKER_COUNT; i++) {
        // 50ms time constant smooths the ~60Hz updates into clickless ramps.
        orbitNodes[i].gain.setTargetAtTime(g[i], now, ORBIT_SMOOTH)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    stopOrbitLoop()
    rafRef.current = requestAnimationFrame(tick)
  }, [getOrbitAngle, stopOrbitLoop])

  const playFromOffset = useCallback((offsetSec: number) => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return

    stopCurrent()

    const params: EightDParams = {
      rotationPeriod: rotationPeriodRef.current,
      direction: directionRef.current,
      mixerVolumes: mixerVolumesRef.current.map((v) => v / 100),
    }

    const clampedOffset = Math.max(0, Math.min(offsetSec, buf.duration))
    const graph = build8dGraph(ctx, buf, params)
    // Seed the initial orbit gains at the correct angle for this offset, including any
    // accumulated phase offset from mid-play period/direction changes. (The builder's own
    // seeding is phase-unaware, so we override it here — the rAF loop takes over at start.)
    const startAngle =
      phaseOffsetRef.current + orbitAngle(clampedOffset, params.rotationPeriod, params.direction)
    const seedGains = orbitGains(startAngle)
    for (let i = 0; i < SPEAKER_COUNT; i++) graph.orbitGains[i].gain.value = seedGains[i]

    sourceRef.current = graph.source
    orbitGainsRef.current = graph.orbitGains
    userGainsRef.current = graph.userGains
    masterRef.current = graph.master

    const now = ctx.currentTime
    startCtxTimeRef.current = now
    startOffsetSecRef.current = clampedOffset

    const gen = ++generationRef.current

    graph.source.onended = () => {
      if (generationRef.current !== gen) return
      isPlayingRef.current = false
      setIsPlaying(false)
      pausedOffsetSecRef.current = 0
      phaseOffsetRef.current = 0
      stopOrbitLoop()
      sourceRef.current = null
    }

    try {
      graph.source.start(0, clampedOffset)
      isPlayingRef.current = true
      setIsPlaying(true)
      runOrbitLoop()
    } catch (err) {
      console.error("Playback start failed", err)
      toast.error("Playback error")
    }
  }, [stopCurrent, stopOrbitLoop, runOrbitLoop])

  const loadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/")) {
      toast.error("Unsupported or corrupted audio file")
      return
    }

    try {
      if (ctxRef.current) {
        stopCurrent()
        try { await ctxRef.current.close() } catch {}
        ctxRef.current = null
      }

      const arrayBuffer = await file.arrayBuffer()

      // Extract album art BEFORE decode (decode detaches the buffer).
      let newArtUrl: string | null = null
      const artBlob = extractAlbumArt(arrayBuffer.slice(0))
      if (artBlob) {
        if (albumArtUrlRef.current) URL.revokeObjectURL(albumArtUrlRef.current)
        newArtUrl = URL.createObjectURL(artBlob)
        albumArtUrlRef.current = newArtUrl
      } else if (albumArtUrlRef.current) {
        URL.revokeObjectURL(albumArtUrlRef.current)
        albumArtUrlRef.current = null
      }

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
      phaseOffsetRef.current = 0
      isPlayingRef.current = false
      setIsPlaying(false)

      bufferRef.current = decoded
      setBuffer(decoded)
      setDuration(decoded.duration)
      setFileName(file.name)
      setAlbumArtUrl(newArtUrl)
    } catch (err) {
      console.error("Decode failed", err)
      toast.error("Unsupported or corrupted audio file")
      if (albumArtUrlRef.current) {
        URL.revokeObjectURL(albumArtUrlRef.current)
        albumArtUrlRef.current = null
      }
      setAlbumArtUrl(null)
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
      generationRef.current += 1 // bump so a stale onended can't fire after resume
      playFromOffset(pausedOffsetSecRef.current)
    }
  }, [getPosition, playFromOffset, stopCurrent])

  const seek = useCallback((seconds: number) => {
    const buf = bufferRef.current
    if (!buf) return
    const clamped = Math.max(0, Math.min(seconds, buf.duration))
    pausedOffsetSecRef.current = clamped
    phaseOffsetRef.current = 0 // seek resets phase — orbit angle is a pure function of position
    if (isPlayingRef.current) {
      ctxRef.current?.resume().catch(() => {})
      playFromOffset(clamped)
    }
  }, [playFromOffset])

  const setRotationPeriod = useCallback((v: number) => {
    let clamped = Math.max(2, Math.min(20, v))
    clamped = Math.round(clamped * 2) / 2 // step 0.5
    // Preserve the current orbit angle so the sound doesn't jump: capture the angle
    // under the OLD params, update the param, then set phaseOffset so the new formula
    // yields the same angle at the current position.
    if (isPlayingRef.current) {
      const currentAngle = getOrbitAngle()
      rotationPeriodRef.current = clamped
      phaseOffsetRef.current =
        currentAngle - orbitAngle(getPosition(), clamped, directionRef.current)
    } else {
      rotationPeriodRef.current = clamped
    }
    setRotationPeriodState(clamped)
  }, [getOrbitAngle, getPosition])

  const setDirection = useCallback((v: 1 | -1) => {
    if (isPlayingRef.current) {
      const currentAngle = getOrbitAngle()
      directionRef.current = v
      phaseOffsetRef.current =
        currentAngle - orbitAngle(getPosition(), rotationPeriodRef.current, v)
    } else {
      directionRef.current = v
    }
    setDirectionState(v)
  }, [getOrbitAngle, getPosition])

  const setMixerVolume = useCallback((i: number, v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)))
    mixerVolumesRef.current = mixerVolumesRef.current.map((old, idx) => (idx === i ? clamped : old))
    setMixerVolumes((prev) => prev.map((old, idx) => (idx === i ? clamped : old)))

    const ctx = ctxRef.current
    const userGains = userGainsRef.current
    if (isPlayingRef.current && userGains && ctx) {
      userGains[i].gain.setTargetAtTime(clamped / 100, ctx.currentTime, MIXER_SMOOTH)
    }
  }, [])

  const resetMixers = useCallback(() => {
    const full = new Array<number>(SPEAKER_COUNT).fill(100)
    mixerVolumesRef.current = full
    setMixerVolumes(full)
    const ctx = ctxRef.current
    const userGains = userGainsRef.current
    if (isPlayingRef.current && userGains && ctx) {
      for (let i = 0; i < SPEAKER_COUNT; i++) {
        userGains[i].gain.setTargetAtTime(1, ctx.currentTime, MIXER_SMOOTH)
      }
    }
  }, [])

  const clear = useCallback(() => {
    stopCurrent()
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {})
      ctxRef.current = null
    }
    if (albumArtUrlRef.current) {
      URL.revokeObjectURL(albumArtUrlRef.current)
      albumArtUrlRef.current = null
    }
    // Mixer / rotation settings are kept across files (non-destructive, per §4.3.6).
    bufferRef.current = null
    setBuffer(null)
    setFileName(null)
    setDuration(0)
    setAlbumArtUrl(null)
    pausedOffsetSecRef.current = 0
    phaseOffsetRef.current = 0
    isPlayingRef.current = false
    setIsPlaying(false)
  }, [stopCurrent])

  const download = useCallback(async (): Promise<void> => {
    const buf = bufferRef.current
    if (isRendering || !buf) return

    setIsRendering(true)
    const base = (fileName || "track").replace(/\.[^/.]+$/, "")
    const period = rotationPeriodRef.current

    const params: EightDParams = {
      rotationPeriod: period,
      direction: directionRef.current,
      mixerVolumes: mixerVolumesRef.current.map((v) => v / 100),
    }

    try {
      toast.loading("Rendering…", { id: "export" })

      const rendered = await renderOffline8d(buf, params)

      const blob = await encodeMp3(rendered, (pct) => {
        toast.loading(`Encoding… ${pct}%`, { id: "export" })
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${base} (8D ${period}s).mp3`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success("Downloaded", { id: "export" })
    } catch (err) {
      console.error("Export failed", err)
      toast.error("Export failed", { id: "export" })
    } finally {
      setIsRendering(false)
    }
  }, [isRendering, fileName])

  useEffect(() => {
    return () => {
      stopCurrent()
      if (ctxRef.current) ctxRef.current.close().catch(() => {})
      if (albumArtUrlRef.current) URL.revokeObjectURL(albumArtUrlRef.current)
    }
  }, [stopCurrent])

  return {
    loadFile,
    clear,
    fileName,
    albumArtUrl,
    buffer,
    duration,
    isPlaying,
    getPosition,
    getOrbitAngle,
    getCurrentGains,
    togglePlay,
    seek,
    rotationPeriod,
    setRotationPeriod,
    direction,
    setDirection,
    mixerVolumes,
    setMixerVolume,
    resetMixers,
    isRendering,
    download,
  }
}
