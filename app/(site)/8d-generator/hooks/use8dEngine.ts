"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "react-hot-toast"

import { extractAlbumArt } from "../../slow-and-reverb/lib/id3AlbumArt"
import { build8dGraph, EightDParams, SEND_SCALE } from "../lib/build8dGraph"
import { SPEAKER_COUNT } from "../lib/speakers"
import { renderOffline8d } from "../lib/renderOffline8d"
import { encodeMp3 } from "../../slow-and-reverb/lib/encodeMp3"

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
  getCurrentGains(): number[] // per-speaker mixer level (0–1) while playing — for SpeakerRing glow
  togglePlay(): void
  seek(seconds: number): void
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
  // Sliders default to 0 → pure clean dry audio (no HRTF sends). Raising one leans the
  // spatial image toward that direction.
  const [mixerVolumes, setMixerVolumes] = useState<number[]>(() =>
    new Array<number>(SPEAKER_COUNT).fill(0),
  )
  const [isRendering, setIsRendering] = useState(false)
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)

  // Audio engine refs
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const sendGainsRef = useRef<GainNode[] | null>(null)
  const masterRef = useRef<GainNode | null>(null)

  const generationRef = useRef(0)
  const pausedOffsetSecRef = useRef(0)
  const startCtxTimeRef = useRef(0)
  const startOffsetSecRef = useRef(0)

  const mixerVolumesRef = useRef<number[]>(new Array<number>(SPEAKER_COUNT).fill(0))
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

  // Per-speaker mixer level (0–1) for the SpeakerRing glow. All active while playing.
  // rAF-safe (reads refs only).
  const getCurrentGains = useCallback((): number[] => {
    if (!isPlayingRef.current) return new Array<number>(SPEAKER_COUNT).fill(0)
    return mixerVolumesRef.current.map((v) => v / 100)
  }, [])

  const stopCurrent = useCallback(() => {
    const src = sourceRef.current
    if (src) {
      // Detach onended BEFORE stopping (see useSlowReverbEngine §12.3): a manual stop
      // (pause / seek / new-file) must never run the natural-end handler, which resets
      // pausedOffsetSecRef to 0 — that would make resume/seek jump back to the start.
      src.onended = null
      try { src.stop() } catch {}
      try { src.disconnect() } catch {}
    }
    sendGainsRef.current?.forEach((n) => { try { n.disconnect() } catch {} })
    if (masterRef.current) { try { masterRef.current.disconnect() } catch {} }
    sourceRef.current = null
    sendGainsRef.current = null
    masterRef.current = null
  }, [])

  const playFromOffset = useCallback((offsetSec: number) => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return

    stopCurrent()

    const params: EightDParams = {
      mixerVolumes: mixerVolumesRef.current.map((v) => v / 100),
    }

    const clampedOffset = Math.max(0, Math.min(offsetSec, buf.duration))
    const graph = build8dGraph(ctx, buf, params)

    sourceRef.current = graph.source
    sendGainsRef.current = graph.sendGains
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
      sourceRef.current = null
    }

    try {
      graph.source.start(0, clampedOffset)
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
    if (isPlayingRef.current) {
      ctxRef.current?.resume().catch(() => {})
      playFromOffset(clamped)
    }
  }, [playFromOffset])

  const setMixerVolume = useCallback((i: number, v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)))
    mixerVolumesRef.current = mixerVolumesRef.current.map((old, idx) => (idx === i ? clamped : old))
    setMixerVolumes((prev) => prev.map((old, idx) => (idx === i ? clamped : old)))

    const ctx = ctxRef.current
    const sendGains = sendGainsRef.current
    if (isPlayingRef.current && sendGains && ctx) {
      sendGains[i].gain.setTargetAtTime((clamped / 100) * SEND_SCALE, ctx.currentTime, MIXER_SMOOTH)
    }
  }, [])

  // Reset to the clean state: all sends off (0), pure dry audio.
  const resetMixers = useCallback(() => {
    const zeros = new Array<number>(SPEAKER_COUNT).fill(0)
    mixerVolumesRef.current = zeros
    setMixerVolumes(zeros)
    const ctx = ctxRef.current
    const sendGains = sendGainsRef.current
    if (isPlayingRef.current && sendGains && ctx) {
      for (let i = 0; i < SPEAKER_COUNT; i++) {
        sendGains[i].gain.setTargetAtTime(0, ctx.currentTime, MIXER_SMOOTH)
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
    // Mixer settings are kept across files (non-destructive).
    bufferRef.current = null
    setBuffer(null)
    setFileName(null)
    setDuration(0)
    setAlbumArtUrl(null)
    pausedOffsetSecRef.current = 0
    isPlayingRef.current = false
    setIsPlaying(false)
  }, [stopCurrent])

  const download = useCallback(async (): Promise<void> => {
    const buf = bufferRef.current
    if (isRendering || !buf) return

    setIsRendering(true)
    const base = (fileName || "track").replace(/\.[^/.]+$/, "")

    const params: EightDParams = {
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
      a.download = `${base} (8D).mp3`
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
    getCurrentGains,
    togglePlay,
    seek,
    mixerVolumes,
    setMixerVolume,
    resetMixers,
    isRendering,
    download,
  }
}
