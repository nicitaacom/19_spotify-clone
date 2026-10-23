"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { toast } from "react-hot-toast"

import { extractId3Metadata, Id3Metadata } from "../../slow-and-reverb/lib/id3AlbumArt"
import { encodeMp3 } from "../../slow-and-reverb/lib/encodeMp3"
import { bitrateChoices, closestStepIndex } from "../lib/bitrate"
import { describeError, namedError } from "../lib/describeError"
import { id3AudioStart, MAX_PCM_BYTES, pcmBytes, readMp3Info } from "../lib/mp3Info"
import { transcodeMp3 } from "../lib/transcodeMp3"

export interface CompressFileEngine {
  loadFile(file: File): Promise<void>
  clear(): void
  fileName: string | null
  buffer: AudioBuffer | null
  duration: number
  sourceBytes: number
  sourceBps: number
  choices: number[]
  kbpsIndex: number
  setKbpsIndex(index: number): void
  isPlaying: boolean
  getPosition(): number
  togglePlay(): void
  pause(): void
  seek(seconds: number): void
  isRendering: boolean
  encodePercent: number | null
  download(): Promise<void>
  albumArtUrl: string | null
  previewUrl: string | null
  getKickLevel(): number
}

async function codecBitrate(bytes: Uint8Array, mimeType: string): Promise<number | null> {
  try {
    const { parseBuffer } = await import("music-metadata")
    const metadata = await parseBuffer(bytes, mimeType || undefined, { skipCovers: true })
    const bitrate = metadata.format.bitrate
    if (bitrate && Number.isFinite(bitrate) && bitrate > 0) return bitrate
  } catch (error) {
    console.error("parseBuffer failed", error)
  }
  return null
}

export function useCompressFileEngine(): CompressFileEngine {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [duration, setDuration] = useState(0)
  const [sourceBytes, setSourceBytes] = useState(0)
  const [sourceBps, setSourceBps] = useState(0)
  const [choices, setChoices] = useState<number[]>([])
  const [kbpsIndex, setKbpsIndexState] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [encodePercent, setEncodePercent] = useState<number | null>(null)
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const generationRef = useRef(0)
  const openGenerationRef = useRef(0)
  const pausedOffsetSecRef = useRef(0)
  const startCtxTimeRef = useRef(0)
  const startOffsetSecRef = useRef(0)
  const isPlayingRef = useRef(false)
  const isRenderingRef = useRef(false)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const albumArtUrlRef = useRef<string | null>(null)
  const metadataRef = useRef<Id3Metadata | null>(null)
  const choicesRef = useRef<number[]>([])
  const kbpsIndexRef = useRef(0)
  const fileNameRef = useRef<string | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const sourceFileRef = useRef<File | null>(null)

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

  const getKickLevel = useCallback(() => 0, [])

  const stopCurrent = useCallback(() => {
    const src = sourceRef.current
    if (!src) return
    src.onended = null
    try { src.stop() } catch { /* already stopped */ }
    try { src.disconnect() } catch { /* already disconnected */ }
    sourceRef.current = null
  }, [])

  const playFromOffset = useCallback((offsetSec: number) => {
    const ctx = ctxRef.current
    const buf = bufferRef.current
    if (!ctx || !buf) return

    stopCurrent()

    const source = ctx.createBufferSource()
    source.buffer = buf
    source.connect(ctx.destination)
    sourceRef.current = source

    const clampedOffset = Math.max(0, Math.min(offsetSec, buf.duration))
    startCtxTimeRef.current = ctx.currentTime
    startOffsetSecRef.current = clampedOffset
    const generation = ++generationRef.current

    source.onended = () => {
      if (generationRef.current !== generation) return
      isPlayingRef.current = false
      setIsPlaying(false)
      pausedOffsetSecRef.current = 0
      sourceRef.current = null
    }

    try {
      source.start(0, clampedOffset)
      isPlayingRef.current = true
      setIsPlaying(true)
    } catch (error) {
      console.error(`Could not start playback of "${fileNameRef.current ?? "the open file"}"`, error)
      toast.error(`Could not start playback of "${fileNameRef.current ?? "the open file"}". ${describeError(error)}`)
    }
  }, [stopCurrent])

  const loadFile = useCallback(async (file: File) => {
    if (file.type && !file.type.startsWith("audio/")) {
      toast.error(`"${file.name}" is ${file.type}, not an audio file.`)
      return
    }

    const generation = ++openGenerationRef.current
    let nextArtUrl: string | null = null

    try {
      if (ctxRef.current) {
        stopCurrent()
        try { await ctxRef.current.close() } catch { /* already closed */ }
        ctxRef.current = null
      }

      let head = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer())
      if (openGenerationRef.current !== generation) return
      const tagEnd = id3AudioStart(head)
      if (tagEnd > head.length && tagEnd < file.size) {
        head = new Uint8Array(await file.slice(0, Math.min(file.size, tagEnd + 65536)).arrayBuffer())
        if (openGenerationRef.current !== generation) return
      }
      const info = readMp3Info(head, file.size)
      const id3 = extractId3Metadata(head.buffer.slice(0))
      if (id3.artData) {
        const artFile = new Blob([id3.artData], { type: id3.artMime })
        nextArtUrl = URL.createObjectURL(artFile)
      }

      const AudioCtx =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
        AudioContext
      const ctx = new AudioCtx()
      ctxRef.current = ctx

      const tooBig = info != null && pcmBytes(info.durationSec, info.sampleRate, info.channels) > MAX_PCM_BYTES
      let decoded: AudioBuffer | null = null
      let measuredBps = info?.bitrateBps ?? 0
      let durationSec = info?.durationSec ?? 0
      let sampleRate = info?.sampleRate ?? 44100
      if (!tooBig) {
        const arrayBuffer = await file.arrayBuffer()
        if (openGenerationRef.current !== generation) {
          if (nextArtUrl) URL.revokeObjectURL(nextArtUrl)
          return
        }
        const preserved = arrayBuffer.slice(0)
        try {
          decoded = await ctx.decodeAudioData(arrayBuffer)
        } catch (error) {
          if (!info || !(error instanceof DOMException) || error.name !== "EncodingError") {
            throw namedError(
              error instanceof Error ? error.name : "EncodingError",
              `decodeAudioData rejected "${file.name}" (${file.type || "no MIME type"}, ${file.size} bytes).`,
              error,
            )
          }
        }
        if (decoded) {
          const codecBps = await codecBitrate(new Uint8Array(preserved), file.type)
          measuredBps = codecBps ?? (decoded.duration > 0 ? (file.size * 8) / decoded.duration : measuredBps)
          durationSec = decoded.duration
          sampleRate = decoded.sampleRate
        }
      }
      if (openGenerationRef.current !== generation) {
        if (nextArtUrl) URL.revokeObjectURL(nextArtUrl)
        try { await ctx.close() } catch { /* already closed */ }
        if (ctxRef.current === ctx) ctxRef.current = null
        return
      }
      if (!decoded && !info) {
        throw namedError(
          "EncodingError",
          `decodeAudioData returned no audio and readMp3Info found no MPEG frame in "${file.name}" (${file.type || "no MIME type"}, ${file.size} bytes).`,
        )
      }

      const nextChoices = bitrateChoices({
        sourceBps: measuredBps,
        durationSec,
        sourceBytes: file.size,
        sampleRate,
      })
      const preview = decoded ? null : URL.createObjectURL(file)

      if (albumArtUrlRef.current) URL.revokeObjectURL(albumArtUrlRef.current)
      albumArtUrlRef.current = nextArtUrl
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = preview
      metadataRef.current = id3
      sourceFileRef.current = preview ? file : null
      nextArtUrl = null

      stopCurrent()
      pausedOffsetSecRef.current = 0
      startOffsetSecRef.current = 0
      startCtxTimeRef.current = 0
      generationRef.current = 0
      isPlayingRef.current = false
      bufferRef.current = decoded
      choicesRef.current = nextChoices
      kbpsIndexRef.current = closestStepIndex(nextChoices)
      fileNameRef.current = file.name

      setIsPlaying(false)
      setBuffer(decoded)
      setDuration(durationSec)
      setFileName(file.name)
      setAlbumArtUrl(albumArtUrlRef.current)
      setPreviewUrl(preview)
      setSourceBytes(file.size)
      setSourceBps(measuredBps)
      setChoices(nextChoices)
      setKbpsIndexState(kbpsIndexRef.current)
    } catch (error) {
      if (nextArtUrl) URL.revokeObjectURL(nextArtUrl)
      if (openGenerationRef.current !== generation) return
      console.error(`Could not open "${file.name}"`, error)
      toast.error(`Could not open "${file.name}" (${file.type || "no MIME type"}, ${file.size} bytes). ${describeError(error)}`)
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
    generationRef.current += 1
    playFromOffset(pausedOffsetSecRef.current)
  }, [pause, playFromOffset])

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

  const setKbpsIndex = useCallback((index: number) => {
    const count = choicesRef.current.length
    if (count === 0) return
    const next = Math.max(0, Math.min(count - 1, Math.round(index)))
    kbpsIndexRef.current = next
    setKbpsIndexState(next)
  }, [])

  const clear = useCallback(() => {
    openGenerationRef.current += 1
    stopCurrent()
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {})
      ctxRef.current = null
    }
    if (albumArtUrlRef.current) {
      URL.revokeObjectURL(albumArtUrlRef.current)
      albumArtUrlRef.current = null
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    metadataRef.current = null
    sourceFileRef.current = null
    bufferRef.current = null
    choicesRef.current = []
    kbpsIndexRef.current = 0
    fileNameRef.current = null
    pausedOffsetSecRef.current = 0
    isPlayingRef.current = false
    setBuffer(null)
    setFileName(null)
    setDuration(0)
    setAlbumArtUrl(null)
    setPreviewUrl(null)
    setSourceBytes(0)
    setSourceBps(0)
    setChoices([])
    setKbpsIndexState(0)
    setIsPlaying(false)
  }, [stopCurrent])

  const download = useCallback(async (): Promise<void> => {
    const buf = bufferRef.current
    const sourceFile = sourceFileRef.current
    const chosen = choicesRef.current[kbpsIndexRef.current]
    if (isRenderingRef.current || (!buf && !sourceFile) || chosen == null) return

    isRenderingRef.current = true
    setIsRendering(true)
    setEncodePercent(0)
    const base = (fileNameRef.current || "track").replace(/\.[^/.]+$/, "")

    try {
      const onProgress = (pct: number) => {
        setEncodePercent(pct)
      }
      const mp3 = buf
        ? await encodeMp3(buf, onProgress, metadataRef.current ?? undefined, chosen)
        : await transcodeMp3(sourceFile as File, chosen, metadataRef.current, onProgress)

      const url = URL.createObjectURL(mp3)
      const link = document.createElement("a")
      link.href = url
      link.download = `${base} (${chosen}kbps).mp3`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error(`Could not encode "${base}.mp3" at ${chosen} kbps`, error)
      toast.error(`Could not encode "${base}.mp3" at ${chosen} kbps. ${describeError(error)}`, { id: "compress-export" })
    } finally {
      isRenderingRef.current = false
      setIsRendering(false)
      setEncodePercent(null)
    }
  }, [])

  useEffect(() => {
    return () => {
      stopCurrent()
      if (ctxRef.current) ctxRef.current.close().catch(() => {})
      if (albumArtUrlRef.current) URL.revokeObjectURL(albumArtUrlRef.current)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [stopCurrent])

  return {
    loadFile,
    clear,
    fileName,
    buffer,
    duration,
    sourceBytes,
    sourceBps,
    choices,
    kbpsIndex,
    setKbpsIndex,
    isPlaying,
    getPosition,
    togglePlay,
    pause,
    seek,
    isRendering,
    encodePercent,
    download,
    albumArtUrl,
    previewUrl,
    getKickLevel,
  }
}
