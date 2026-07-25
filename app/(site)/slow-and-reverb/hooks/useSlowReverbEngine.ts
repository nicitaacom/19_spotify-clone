"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "react-hot-toast"

import { buildEffectsGraph, EffectsParams, semitonesToRatio } from "../lib/buildEffectsGraph"
import { renderOffline } from "../lib/renderOffline"
import { encodeMp3 } from "../lib/encodeMp3"
import { extractId3Metadata, Id3Metadata } from "../lib/id3AlbumArt"
import { createKickDetector, KickDetector } from "../lib/kickDetector"

export interface PresetValues {
  speed: number
  reverb: number
  bass: number
  pitchSt: number
}

export interface SlowReverbEngine {
  loadFile(file: File): Promise<void>
  fileName: string | null
  buffer: AudioBuffer | null
  duration: number
  isPlaying: boolean
  getPosition(): number
  togglePlay(): void
  pause(): void
  seek(seconds: number): void
  speed: number
  setSpeed(v: number): void
  reverb: number
  setReverb(v: number): void
  bass: number
  setBass(v: number): void
  pitchSemitones: number
  setPitchSemitones(v: number): void
  pitchEnabled: boolean
  setPitchEnabled(v: boolean): void
  applyPreset(values: PresetValues): void
  isRendering: boolean
  download(): Promise<void>
  clear(): void
  albumArtUrl: string | null
  getKickLevel(): number
}

export function useSlowReverbEngine(): SlowReverbEngine {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [reverb, setReverbState] = useState(0)
  const [bass, setBassState] = useState(0)
  const [pitchSemitones, setPitchSemitonesState] = useState(0)
  const [pitchEnabled, setPitchEnabledState] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)

  // Audio engine refs
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const lowshelfRef = useRef<BiquadFilterNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const pitchShifterRef = useRef<ReturnType<typeof import("../lib/pitchShifter").createPitchShifter> | null>(null)
  const kickAnalyserRef = useRef<AnalyserNode | null>(null)
  const kickTimeDataRef = useRef<Float32Array | null>(null)
  const kickDetectorRef = useRef<KickDetector | null>(null)

  const generationRef = useRef(0)
  const pausedOffsetSecRef = useRef(0)
  const startCtxTimeRef = useRef(0)
  const startOffsetSecRef = useRef(0)

  const speedRef = useRef(1)
  const reverbRef = useRef(0)
  const bassRef = useRef(0)
  const pitchSemitonesRef = useRef(0)
  const pitchEnabledRef = useRef(false)
  const isPlayingRef = useRef(false)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const albumArtUrlRef = useRef<string | null>(null)
  const metadataRef = useRef<Id3Metadata | null>(null)

  // Sync refs
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { reverbRef.current = reverb }, [reverb])
  useEffect(() => { bassRef.current = bass }, [bass])
  useEffect(() => { pitchSemitonesRef.current = pitchSemitones }, [pitchSemitones])
  useEffect(() => { pitchEnabledRef.current = pitchEnabled }, [pitchEnabled])
  useEffect(() => { bufferRef.current = buffer }, [buffer])
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  const stopCurrent = useCallback(() => {
    const src = sourceRef.current
    if (src) {
      // Detach onended BEFORE stopping: src.stop() fires onended asynchronously,
      // and the natural-end handler resets pausedOffsetSecRef to 0. A manual stop
      // (pause / seek / param restart) must never trigger that, or resume/seek
      // would jump back to the start. (cf. dev_readme-player.md: never let a stop
      // run the end-of-track path.)
      src.onended = null
      try { src.stop() } catch {}
      try { src.disconnect() } catch {}
    }
    const ls = lowshelfRef.current
    if (ls) { try { ls.disconnect() } catch {} }
    const wg = wetGainRef.current
    if (wg) { try { wg.disconnect() } catch {} }
    const dg = dryGainRef.current
    if (dg) { try { dg.disconnect() } catch {} }
    const ps = pitchShifterRef.current
    if (ps) {
      try { ps.input.disconnect() } catch {}
      try { ps.output.disconnect() } catch {}
    }
    const ka = kickAnalyserRef.current
    if (ka) { try { ka.disconnect() } catch {} }
    sourceRef.current = null
    lowshelfRef.current = null
    wetGainRef.current = null
    dryGainRef.current = null
    pitchShifterRef.current = null
    kickAnalyserRef.current = null
    kickTimeDataRef.current = null
    kickDetectorRef.current = null
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

  // Kick onset strength (0..1) for the reactive background. Time-domain RMS of a 120 Hz
  // lowpassed tap, compared to the track's OWN recent average (see lib/kickDetector.ts) —
  // song-independent by construction, and blind to hats/claps/vocals because the tap is
  // hard low-passed before we ever measure it. Returns 0 on non-onset frames.
  const getKickLevel = useCallback((): number => {
    const analyser = kickAnalyserRef.current
    const data = kickTimeDataRef.current
    const detector = kickDetectorRef.current
    if (!analyser || !data || !detector || !isPlayingRef.current) return 0
    analyser.getFloatTimeDomainData(data)
    let sumSq = 0
    for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i]
    const rms = Math.sqrt(sumSq / data.length)
    return detector.update(rms, performance.now())
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
      pitchSemitones: pitchSemitonesRef.current,
      pitchEnabled: pitchEnabledRef.current,
    }

    const graph = buildEffectsGraph(ctx, buf, params)
    sourceRef.current = graph.source
    lowshelfRef.current = graph.lowshelf
    wetGainRef.current = graph.wetGain
    dryGainRef.current = graph.dryGain
    pitchShifterRef.current = graph.pitchShifter
    kickAnalyserRef.current = graph.kickAnalyser
    // Reused time-domain buffer for RMS reads. Fresh detector per play/seek → fresh history
    // (a ~200 ms warm-up after each seek is accepted; kickDetector returns 0 during it).
    kickTimeDataRef.current = new Float32Array(graph.kickAnalyser.fftSize)
    kickDetectorRef.current = createKickDetector()

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
        if (albumArtUrlRef.current) {
          URL.revokeObjectURL(albumArtUrlRef.current)
        }
        const artBlob = new Blob([metadata.artData], { type: metadata.artMime })
        newArtUrl = URL.createObjectURL(artBlob)
        albumArtUrlRef.current = newArtUrl
      } else {
        if (albumArtUrlRef.current) {
          URL.revokeObjectURL(albumArtUrlRef.current)
          albumArtUrlRef.current = null
        }
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
      // cleanup art on error
      if (albumArtUrlRef.current) {
        URL.revokeObjectURL(albumArtUrlRef.current)
        albumArtUrlRef.current = null
      }
      setAlbumArtUrl(null)
    }
  }, [stopCurrent])

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return

    pausedOffsetSecRef.current = getPosition()
    stopCurrent()
    isPlayingRef.current = false
    setIsPlaying(false)
  }, [getPosition, stopCurrent])

  const togglePlay = useCallback(() => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return

    if (isPlayingRef.current) {
      pause()
      return
    }

    ctx.resume().catch(() => {})
    const offset = pausedOffsetSecRef.current
    generationRef.current += 1 // bump to ensure pitch/speed survive resume (round 4 fix)
    playFromOffset(offset)
  }, [pause, playFromOffset])

  const seek = useCallback((seconds: number) => {
    const buf = bufferRef.current
    if (!buf) return
    const clamped = Math.max(0, Math.min(seconds, buf.duration))
    pausedOffsetSecRef.current = clamped
    if (isPlayingRef.current) {
      const ctx = ctxRef.current
      if (ctx) ctx.resume().catch(() => {})
      playFromOffset(clamped)
    }
  }, [playFromOffset])

  const setSpeed = useCallback((v: number) => {
    let clamped = Math.max(0.5, Math.min(1.5, v))
    clamped = Math.round(clamped * 20) / 20
    setSpeedState(clamped)
    speedRef.current = clamped

    // Transposition is independent of speed, so the shifter is untouched here.
    const ctx = ctxRef.current
    if (isPlayingRef.current && sourceRef.current && ctx) {
      const pos = getPosition()
      startOffsetSecRef.current = pos
      startCtxTimeRef.current = ctx.currentTime
      sourceRef.current.playbackRate.setTargetAtTime(clamped, ctx.currentTime, 0.03)
    }
  }, [getPosition])

  const setReverb = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)))
    setReverbState(clamped)
    reverbRef.current = clamped

    const ctx = ctxRef.current
    if (isPlayingRef.current && wetGainRef.current && ctx) {
      wetGainRef.current.gain.setTargetAtTime(clamped / 100, ctx.currentTime, 0.03)
    }
  }, [])

  const setBass = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(v)))
    setBassState(clamped)
    bassRef.current = clamped

    const ctx = ctxRef.current
    if (isPlayingRef.current && lowshelfRef.current && ctx) {
      lowshelfRef.current.gain.setTargetAtTime((clamped / 100) * 12, ctx.currentTime, 0.03)
    }
  }, [])

  const setPitchSemitones = useCallback((v: number) => {
    const clamped = Math.max(-12, Math.min(12, Math.round(v)))
    setPitchSemitonesState(clamped)
    pitchSemitonesRef.current = clamped

    const ctx = ctxRef.current
    if (isPlayingRef.current && pitchShifterRef.current && ctx && pitchEnabledRef.current) {
      pitchShifterRef.current.setRatio(semitonesToRatio(clamped), ctx.currentTime)
    }
  }, [])

  const setPitchEnabled = useCallback((enabled: boolean) => {
    setPitchEnabledState(enabled)
    pitchEnabledRef.current = enabled

    const ctx = ctxRef.current
    if (isPlayingRef.current && pitchShifterRef.current && ctx) {
      const ratio = enabled ? semitonesToRatio(pitchSemitonesRef.current) : 1
      pitchShifterRef.current.setRatio(ratio, ctx.currentTime)
    }
  }, [])

  const applyPreset = useCallback(
    (values: PresetValues) => {
      setSpeed(values.speed)
      setReverb(values.reverb)
      setBass(values.bass)
      if (values.pitchSt !== 0) {
        setPitchSemitones(values.pitchSt)
        setPitchEnabled(true)
      } else {
        setPitchSemitones(0)
        setPitchEnabled(false)
      }
    },
    [setSpeed, setReverb, setBass, setPitchSemitones, setPitchEnabled],
  )

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

  const download = async (): Promise<void> => {
    const buf = bufferRef.current
    if (isRendering || !buf) return

    setIsRendering(true)
    const base = (fileName || "track").replace(/\.[^/.]+$/, "")
    const speedVal = speedRef.current
    const rev = reverbRef.current
    const semitones = pitchSemitonesRef.current
    const enabled = pitchEnabledRef.current

    const pitchLabel =
      enabled && semitones !== 0 ? ` pitch ${semitones > 0 ? "+" : ""}${semitones}st` : ""
    const fileBase = `${base} (slowed ${speedVal}x, reverb ${rev}%${pitchLabel})`

    try {
      toast.loading("Rendering…", { id: "export" })

      const rendered = await renderOffline(buf, {
        speed: speedVal,
        reverb: rev,
        bass: bassRef.current,
        pitchSemitones: semitones,
        pitchEnabled: enabled,
      })

      const blob = await encodeMp3(rendered, (pct) => {
        toast.loading(`Encoding… ${pct}%`, { id: "export" })
      }, metadataRef.current ?? undefined)

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${fileBase}.mp3`
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
  }

  useEffect(() => {
    return () => {
      stopCurrent()
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {})
      }
      if (albumArtUrlRef.current) {
        URL.revokeObjectURL(albumArtUrlRef.current)
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
    pause,
    seek,
    speed,
    setSpeed,
    reverb,
    setReverb,
    bass,
    setBass,
    pitchSemitones,
    setPitchSemitones,
    pitchEnabled,
    setPitchEnabled,
    applyPreset,
    isRendering,
    download,
    clear,
    albumArtUrl,
    getKickLevel,
  }
}
