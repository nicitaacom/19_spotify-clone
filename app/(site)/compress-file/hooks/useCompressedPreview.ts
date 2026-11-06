"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "react-hot-toast"

import { describeError } from "../lib/describeError"
import { chunkStartSec, nextEncodeAtSec, PREVIEW_CHUNK_SEC } from "../lib/previewSchedule"

type Mp3Part = { arrayBuffer: () => Promise<ArrayBuffer> }

type KeptChunk = {
  startSec: number
  seconds: number
  encodeMs: number
  mp3: Mp3Part
  sound?: AudioBuffer
}

export function useCompressedPreview(args: {
  active: boolean
  durationSec: number
  kbps: number | null
  fileName: string | null
  encodeChunk: (startSec: number, seconds: number) => Promise<Mp3Part | null>
}) {
  const { active, durationSec, kbps, fileName, encodeChunk } = args
  const [positionSec, setPositionSec] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [volume, setVolumeState] = useState(1)

  const durationRef = useRef(durationSec)
  const kbpsRef = useRef(kbps)
  const encodeRef = useRef(encodeChunk)
  const fileRef = useRef(fileName)
  const generationRef = useRef(0)
  const playTokenRef = useRef(0)
  const holdRef = useRef(0)
  const playingRef = useRef(false)
  const pausedAtRef = useRef(0)
  const startedCtxRef = useRef(0)
  const startedSongRef = useRef(0)
  const volumeRef = useRef(1)
  const watchRef = useRef(0)
  const seekTimerRef = useRef(0)
  const takeChunkRef = useRef<(startSec: number, generation: number) => Promise<KeptChunk | null>>(async () => null)
  const playFromRef = useRef<(songPos: number) => Promise<void>>(async () => {})
  const getPositionRef = useRef<() => number>(() => 0)
  const stopNodeRef = useRef<() => void>(() => {})
  const stopWatchRef = useRef<() => void>(() => {})
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const nodeRef = useRef<AudioBufferSourceNode | null>(null)
  const chunksRef = useRef<Map<number, KeptChunk>>(new Map())
  const pendingRef = useRef<Map<number, Promise<KeptChunk | null>>>(new Map())

  durationRef.current = durationSec
  kbpsRef.current = kbps
  encodeRef.current = encodeChunk

  const stopWatch = useCallback(() => {
    window.clearInterval(watchRef.current)
    watchRef.current = 0
  }, [])

  const stopNode = useCallback(() => {
    const node = nodeRef.current
    if (!node) return
    node.onended = null
    try { node.stop() } catch { /* already stopped */ }
    try { node.disconnect() } catch { /* already disconnected */ }
    nodeRef.current = null
  }, [])

  const audioContext = useCallback(() => {
    if (ctxRef.current) return ctxRef.current
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
      AudioContext
    const ctx = new Ctx()
    const gain = ctx.createGain()
    gain.gain.value = volumeRef.current
    gain.connect(ctx.destination)
    ctxRef.current = ctx
    gainRef.current = gain
    return ctx
  }, [])

  const getPosition = useCallback(() => {
    const duration = durationRef.current
    if (!playingRef.current || !ctxRef.current) return pausedAtRef.current
    const elapsed = ctxRef.current.currentTime - startedCtxRef.current
    return Math.max(0, Math.min(duration, startedSongRef.current + elapsed))
  }, [])

  const takeChunk = useCallback(async (startSec: number, generation: number): Promise<KeptChunk | null> => {
    const cached = chunksRef.current.get(startSec)
    if (cached) return cached
    const pending = pendingRef.current.get(startSec)
    if (pending) return pending
    const duration = durationRef.current
    const seconds = Math.min(PREVIEW_CHUNK_SEC, duration - startSec)
    if (seconds < 0.05 || kbpsRef.current == null) return null
    const job = (async (): Promise<KeptChunk | null> => {
      const started = performance.now()
      try {
        const mp3 = await encodeRef.current(startSec, seconds)
        if (!mp3 || generationRef.current !== generation) return null
        const kept: KeptChunk = { startSec, seconds, encodeMs: performance.now() - started, mp3 }
        if (generationRef.current !== generation) return null
        chunksRef.current.set(startSec, kept)
        return kept
      } catch (error) {
        console.error(`Could not prepare the ${kbpsRef.current} kbps preview from ${Math.floor(startSec)}s`, error)
        toast.error(
          `Could not prepare the ${kbpsRef.current} kbps preview from ${Math.floor(startSec)}s. ${describeError(error)}`,
          { id: "compress-preview" },
        )
        return null
      }
    })()
    pendingRef.current.set(startSec, job)
    void job.finally(() => {
      if (pendingRef.current.get(startSec) === job) pendingRef.current.delete(startSec)
    })
    return job
  }, [])

  const startWatch = useCallback(() => {
    stopWatch()
    watchRef.current = window.setInterval(() => {
      if (!playingRef.current) return
      const pos = getPosition()
      pausedAtRef.current = pos
      setPositionSec(pos)
      const start = chunkStartSec(pos)
      const chunk = chunksRef.current.get(start)
      if (!chunk) return
      const nextStart = start + PREVIEW_CHUNK_SEC
      if (nextStart >= durationRef.current - 0.05) return
      if (chunksRef.current.has(nextStart) || pendingRef.current.has(nextStart)) return
      if (pos < nextEncodeAtSec(chunk.startSec, chunk.seconds, chunk.encodeMs)) return
      void takeChunk(nextStart, generationRef.current).then(next => {
        const ctx = ctxRef.current
        if (!next || !ctx || next.sound) return
        void next.mp3.arrayBuffer().then(bytes => ctx.decodeAudioData(bytes)).then(sound => {
          if (chunksRef.current.get(nextStart) === next) next.sound = sound
        }).catch(() => { /* playFrom decodes again */ })
      })
    }, 100)
  }, [getPosition, stopWatch, takeChunk])

  const playFrom = useCallback(async (songPos: number) => {
    const generation = generationRef.current
    const token = ++playTokenRef.current
    playingRef.current = true
    setPlaying(true)
    const duration = durationRef.current
    const pos = Math.max(0, Math.min(songPos, Math.max(0, duration - 0.05)))
    const start = chunkStartSec(pos)
    const cached = chunksRef.current.get(start)
    if (!cached) setPreparing(true)
    const ctx = audioContext()
    void ctx.resume()
    const chunk = cached ?? await takeChunk(start, generation)
    if (!chunk || generationRef.current !== generation || playTokenRef.current !== token) {
      if (generationRef.current === generation && playTokenRef.current === token) {
        playingRef.current = false
        setPlaying(false)
        setPreparing(false)
      }
      return
    }
    let sound = chunk.sound
    if (!sound) {
      try {
        sound = await ctx.decodeAudioData(await chunk.mp3.arrayBuffer())
      } catch (error) {
        console.error(`Could not play the ${kbpsRef.current} kbps preview from ${Math.floor(start)}s`, error)
        toast.error(
          `Could not play the ${kbpsRef.current} kbps preview from ${Math.floor(start)}s. ${describeError(error)}`,
          { id: "compress-preview" },
        )
        setPreparing(false)
        return
      }
      if (generationRef.current !== generation || playTokenRef.current !== token) return
      chunk.sound = sound
    }
    stopNode()
    const gain = gainRef.current
    if (!gain) return
    const offsetInChunk = Math.max(0, pos - chunk.startSec)
    const offset = Math.min(offsetInChunk, Math.max(0, sound.duration - 0.05))
    const remain = Math.max(0.05, chunk.seconds - offsetInChunk)
    const playFor = Math.max(0.05, Math.min(remain, sound.duration - offset))
    const node = ctx.createBufferSource()
    node.buffer = sound
    node.connect(gain)
    node.onended = () => {
      if (nodeRef.current !== node) return
      nodeRef.current = null
      if (!playingRef.current || playTokenRef.current !== token) return
      const next = chunk.startSec + chunk.seconds
      chunk.sound = undefined
      if (next >= durationRef.current - 0.05) {
        playingRef.current = false
        pausedAtRef.current = durationRef.current
        setPlaying(false)
        setPositionSec(durationRef.current)
        stopWatch()
        return
      }
      void playFromRef.current(next)
    }
    const when = ctx.currentTime
    node.start(when, offset, playFor)
    nodeRef.current = node
    startedCtxRef.current = when
    startedSongRef.current = pos
    pausedAtRef.current = pos
    playingRef.current = true
    setPlaying(true)
    setPreparing(false)
    setPositionSec(pos)
    startWatch()
  }, [audioContext, startWatch, stopNode, stopWatch, takeChunk])

  playFromRef.current = playFrom
  takeChunkRef.current = takeChunk
  getPositionRef.current = getPosition
  stopNodeRef.current = stopNode
  stopWatchRef.current = stopWatch

  const pause = useCallback(() => {
    holdRef.current += 1
    playTokenRef.current += 1
    const pos = getPosition()
    pausedAtRef.current = pos
    playingRef.current = false
    setPositionSec(pos)
    setPlaying(false)
    stopNode()
    stopWatch()
  }, [getPosition, stopNode, stopWatch])

  const toggle = useCallback(() => {
    const ctx = audioContext()
    void ctx.resume()
    if (playingRef.current) {
      pause()
      return
    }
    void playFrom(pausedAtRef.current)
  }, [audioContext, pause, playFrom])

  const seek = useCallback((seconds: number) => {
    const pos = Math.max(0, Math.min(seconds, durationRef.current || 0))
    pausedAtRef.current = pos
    setPositionSec(pos)
    playTokenRef.current += 1
    stopNode()
    stopWatch()
    window.clearTimeout(seekTimerRef.current)
    seekTimerRef.current = window.setTimeout(() => {
      if (playingRef.current) {
        void playFrom(pos)
        return
      }
      if (kbpsRef.current == null) return
      void takeChunk(chunkStartSec(pos), generationRef.current)
    }, 300)
  }, [playFrom, stopNode, stopWatch, takeChunk])

  const stop = useCallback(() => {
    generationRef.current += 1
    holdRef.current += 1
    playTokenRef.current += 1
    window.clearTimeout(seekTimerRef.current)
    chunksRef.current.clear()
    pendingRef.current.clear()
    pausedAtRef.current = 0
    playingRef.current = false
    fileRef.current = null
    setPlaying(false)
    setPreparing(false)
    setPositionSec(0)
    stopNode()
    stopWatch()
  }, [stopNode, stopWatch])

  const setVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value))
    volumeRef.current = next
    if (gainRef.current) gainRef.current.gain.value = next
    setVolumeState(next)
  }, [])

  useEffect(() => {
    if (!active || kbps == null || durationSec <= 0) return
    stopNodeRef.current()
    stopWatchRef.current()
    let resume = playingRef.current
    let pos = playingRef.current ? getPositionRef.current() : pausedAtRef.current
    if (fileRef.current !== fileName) {
      fileRef.current = fileName
      pos = 0
      resume = false
    }
    pausedAtRef.current = pos
    playingRef.current = false
    const hold = holdRef.current
    const timer = window.setTimeout(() => {
      const generation = ++generationRef.current
      const at = pausedAtRef.current
      const keepPlaying = (resume || playingRef.current) && holdRef.current === hold
      playTokenRef.current += 1
      chunksRef.current.clear()
      pendingRef.current.clear()
      setPlaying(false)
      setPositionSec(at)
      setPreparing(true)
      void takeChunkRef.current(chunkStartSec(at), generation).then(chunk => {
        if (generationRef.current !== generation) return
        setPreparing(false)
        if (keepPlaying && chunk) void playFromRef.current(at)
      })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [active, durationSec, fileName, kbps])

  useEffect(() => {
    return () => {
      generationRef.current += 1
      window.clearTimeout(seekTimerRef.current)
      stopWatch()
      stopNode()
      const ctx = ctxRef.current
      ctxRef.current = null
      if (ctx) ctx.close().catch(() => {})
    }
  }, [stopNode, stopWatch])

  return { positionSec, playing, preparing, volume, getPosition, toggle, seek, pause, stop, setVolume }
}
