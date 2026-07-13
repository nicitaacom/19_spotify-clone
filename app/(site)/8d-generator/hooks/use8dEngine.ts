"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "react-hot-toast"

import { extractId3Metadata, Id3Metadata } from "../../slow-and-reverb/lib/id3AlbumArt"
import { build8dGraph, EightDParams } from "../lib/build8dGraph"
import { SPEAKER_COUNT, weightedPosition, positionAngle, weightsForPosition } from "../lib/speakers"
import { renderOffline8d } from "../lib/renderOffline8d"
import { encodeMp3 } from "../../slow-and-reverb/lib/encodeMp3"

const POS_SMOOTH = 0.05 // s — time constant for smoothly gliding the panner position
const XFADE_SMOOTH = 0.04 // s — time constant for the dry/wet (8D on/off) crossfade

export interface EightDEngine {
  loadFile(file: File): Promise<void>
  clear(): void
  fileName: string | null
  albumArtUrl: string | null
  buffer: AudioBuffer | null
  duration: number
  isPlaying: boolean
  getPosition(): number
  getCurrentGains(): number[] // per-speaker slider level (0–1) — for SpeakerRing chip glow
  getSourcePos(): { angle: number; radius: number } // where the single 8D source sits — for the ring dot
  togglePlay(): void
  seek(seconds: number): void
  mixerVolumes: number[]
  setMixerVolume(i: number, v: number): void // 0–100 in UI
  setSourcePosition(angle: number, radius: number): void
  resetMixers(): void
  enabled: boolean
  setEnabled(v: boolean): void
  isRendering: boolean
  download(): Promise<void>
}

export function use8dEngine(): EightDEngine {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  // Direction weights (0–100). All 0 = centered. Together they steer ONE panner position.
  const [mixerVolumes, setMixerVolumes] = useState<number[]>(() =>
    new Array<number>(SPEAKER_COUNT).fill(0),
  )
  const [enabled, setEnabledState] = useState(true)
  const [isRendering, setIsRendering] = useState(false)
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)

  // Audio engine refs
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const pannerRef = useRef<PannerNode | null>(null)
  const masterRef = useRef<GainNode | null>(null)

  const generationRef = useRef(0)
  const pausedOffsetSecRef = useRef(0)
  const startCtxTimeRef = useRef(0)
  const startOffsetSecRef = useRef(0)

  const mixerVolumesRef = useRef<number[]>(new Array<number>(SPEAKER_COUNT).fill(0))
  const enabledRef = useRef(true)
  const isPlayingRef = useRef(false)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const albumArtUrlRef = useRef<string | null>(null)
  const metadataRef = useRef<Id3Metadata | null>(null)

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

  // Per-speaker slider level (0–1) for the SpeakerRing chip glow. rAF-safe (reads refs).
  const getCurrentGains = useCallback((): number[] => {
    return mixerVolumesRef.current.map((v) => v / 100)
  }, [])

  // Where the single 8D source currently sits (for the ring dot). radius 0 = centered.
  const getSourcePos = useCallback((): { angle: number; radius: number } => {
    const p = weightedPosition(mixerVolumesRef.current.map((v) => v / 100))
    return { angle: positionAngle(p.x, p.z), radius: p.radius }
  }, [])

  // Push the current weighted position onto the live panner (smooth glide, no jumps).
  const applyPosition = useCallback(() => {
    const ctx = ctxRef.current
    const panner = pannerRef.current
    if (!ctx || !panner) return
    const p = weightedPosition(mixerVolumesRef.current.map((v) => v / 100))
    const now = ctx.currentTime
    panner.positionX.setTargetAtTime(p.x, now, POS_SMOOTH)
    panner.positionY.setTargetAtTime(p.y, now, POS_SMOOTH)
    panner.positionZ.setTargetAtTime(p.z, now, POS_SMOOTH)
  }, [])

  // Crossfade dry/wet to the current enabled flag (smooth, no click).
  const applyEnabled = useCallback(() => {
    const ctx = ctxRef.current
    const dry = dryGainRef.current
    const wet = wetGainRef.current
    if (!ctx || !dry || !wet) return
    const now = ctx.currentTime
    dry.gain.setTargetAtTime(enabledRef.current ? 0 : 1, now, XFADE_SMOOTH)
    wet.gain.setTargetAtTime(enabledRef.current ? 1 : 0, now, XFADE_SMOOTH)
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
    if (dryGainRef.current) { try { dryGainRef.current.disconnect() } catch {} }
    if (wetGainRef.current) { try { wetGainRef.current.disconnect() } catch {} }
    if (pannerRef.current) { try { pannerRef.current.disconnect() } catch {} }
    if (masterRef.current) { try { masterRef.current.disconnect() } catch {} }
    sourceRef.current = null
    dryGainRef.current = null
    wetGainRef.current = null
    pannerRef.current = null
    masterRef.current = null
  }, [])

  const playFromOffset = useCallback((offsetSec: number) => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return

    stopCurrent()

    const params: EightDParams = {
      mixerVolumes: mixerVolumesRef.current.map((v) => v / 100),
      enabled: enabledRef.current,
    }

    const clampedOffset = Math.max(0, Math.min(offsetSec, buf.duration))
    const graph = build8dGraph(ctx, buf, params)

    sourceRef.current = graph.source
    dryGainRef.current = graph.dryGain
    wetGainRef.current = graph.wetGain
    pannerRef.current = graph.panner
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

      // Extract ID3 metadata (art + title/artist/album) BEFORE decode (decode detaches
      // the buffer). Kept so download() can re-embed it into the exported MP3.
      const metadata = extractId3Metadata(arrayBuffer.slice(0))
      metadataRef.current = metadata

      let newArtUrl: string | null = null
      if (metadata.artData) {
        if (albumArtUrlRef.current) URL.revokeObjectURL(albumArtUrlRef.current)
        const artBlob = new Blob([metadata.artData], { type: metadata.artMime })
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
    if (isPlayingRef.current) applyPosition()
  }, [applyPosition])

  const setSourcePosition = useCallback((angle: number, radius: number) => {
    const volumes = weightsForPosition(angle, radius).map((weight) => weight * 100)
    mixerVolumesRef.current = volumes
    setMixerVolumes(volumes)
    if (isPlayingRef.current) applyPosition()
  }, [applyPosition])

  // Reset all weights to 0 (centered — no directional preference).
  const resetMixers = useCallback(() => {
    const zeros = new Array<number>(SPEAKER_COUNT).fill(0)
    mixerVolumesRef.current = zeros
    setMixerVolumes(zeros)
    if (isPlayingRef.current) applyPosition()
  }, [applyPosition])

  const setEnabled = useCallback((v: boolean) => {
    enabledRef.current = v
    setEnabledState(v)
    if (isPlayingRef.current) applyEnabled()
  }, [applyEnabled])

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
    // Mixer / enabled settings are kept across files (non-destructive).
    metadataRef.current = null
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
      enabled: enabledRef.current,
    }

    try {
      toast.loading("Rendering…", { id: "export" })

      const rendered = await renderOffline8d(buf, params)

      const blob = await encodeMp3(rendered, (pct) => {
        toast.loading(`Encoding… ${pct}%`, { id: "export" })
      }, metadataRef.current ?? undefined)

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
    getSourcePos,
    togglePlay,
    seek,
    mixerVolumes,
    setMixerVolume,
    setSourcePosition,
    resetMixers,
    enabled,
    setEnabled,
    isRendering,
    download,
  }
}
