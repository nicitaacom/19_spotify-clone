"use client"

import { useEffect, useRef, useState } from "react"
import { twMerge } from "tailwind-merge"

import { useExclusivePlaybackSource } from "@/app/providers/PlaybackSyncProvider"
import AlbumArt from "../../slow-and-reverb/components/AlbumArt"
import EffectSliderRow from "../../slow-and-reverb/components/EffectSliderRow"
import FileDropZone from "../../slow-and-reverb/components/FileDropZone"
import FullScreenDropOverlay from "../../slow-and-reverb/components/FullScreenDropOverlay"
import Waveform from "../../slow-and-reverb/components/Waveform"
import { useDocumentDrag } from "../../slow-and-reverb/hooks/useDocumentDrag"
import { useCompressFileEngine } from "../hooks/useCompressFileEngine"
import { estimateMp3Bytes, formatBitrate, formatBytes } from "../lib/bitrate"
import { PREVIEW_WINDOW_SEC } from "../lib/transcodeMp3"

function formatClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remain = whole % 60
  return `${minutes}:${String(remain).padStart(2, "0")}`
}

const CompressFileEditor = () => {
  const {
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
    pause,
    isRendering,
    encodePercent,
    encodedReady,
    download,
    encodePreview,
    albumArtUrl,
    previewUrl,
    getKickLevel,
  } = useCompressFileEngine()

  const previewRef = useRef<HTMLAudioElement | null>(null)
  const heardUrlRef = useRef<string | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [heardUrl, setHeardUrl] = useState<string | null>(null)
  const [heardFrom, setHeardFrom] = useState(0)
  const [heardFile, setHeardFile] = useState(fileName)
  const [previewBusy, setPreviewBusy] = useState(false)
  if (fileName !== heardFile) {
    setHeardFile(fileName)
    setHeardFrom(0)
  }

  useExclusivePlaybackSource({
    isPlaying: isPlaying || previewPlaying,
    onStop: () => {
      pause()
      previewRef.current?.pause()
    },
  })

  const { isDragging } = useDocumentDrag()

  useEffect(() => {
    if (!isRendering) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isRendering])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "AUDIO" || el?.isContentEditable) return
      const preview = previewRef.current
      if (!preview) return
      event.preventDefault()
      el?.blur()
      if (preview.paused) void preview.play()
      else preview.pause()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const stopPreview = () => {
    setPreviewPlaying(false)
    if (heardUrlRef.current) URL.revokeObjectURL(heardUrlRef.current)
    heardUrlRef.current = null
    setHeardUrl(null)
    setHeardFrom(0)
    clear()
  }

  const chosenKbps = choices[kbpsIndex]
  const estimate = chosenKbps == null ? null : estimateMp3Bytes(duration, chosenKbps)
  const smallerPct = estimate == null || sourceBytes <= 0
    ? 0
    : Math.max(0, Math.round((1 - estimate / sourceBytes) * 100))
  const presetsHighFirst = choices.slice().reverse()
  const leadPresets = presetsHighFirst.slice(0, 3)
  const tailPresets = presetsHighFirst.slice(3)

  const presetBtn = (active: boolean) =>
    twMerge(
      "px-4 py-1.5 rounded-md text-xs border transition",
      active
        ? "bg-elevated border-neon/30 text-neon shadow-neon-sm"
        : "bg-elevated border-white/10 text-neutral-300 hover:border-neon/30 hover:text-white",
    )

  const isEmpty = !fileName || (!buffer && !previewUrl)

  useEffect(() => {
    if (chosenKbps == null || isEmpty) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setPreviewBusy(true)
      void encodePreview(heardFrom).then(file => {
        if (cancelled || !file) return
        const url = URL.createObjectURL(file)
        if (heardUrlRef.current) URL.revokeObjectURL(heardUrlRef.current)
        heardUrlRef.current = url
        setHeardUrl(url)
        const audio = previewRef.current
        if (audio) {
          const wasPlaying = !audio.paused
          audio.src = url
          audio.currentTime = 0
          if (wasPlaying) void audio.play()
        }
      }).catch(error => {
        console.error("Could not prepare the bitrate preview", error)
      }).finally(() => {
        if (!cancelled) setPreviewBusy(false)
      })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [chosenKbps, encodePreview, fileName, heardFrom, isEmpty])

  useEffect(() => {
    return () => {
      if (heardUrlRef.current) URL.revokeObjectURL(heardUrlRef.current)
    }
  }, [])

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center">
        <FileDropZone onFile={loadFile} hint="Audio in, smaller MP3 out" />
        <ol className="flex flex-col gap-1.5 text-sm text-neutral-400 items-center mt-6">
          <li>
            <span className="text-neutral-500 text-xs uppercase tracking-wide font-medium">STEP 1: </span>
            Upload an audio file
          </li>
          <li>
            <span className="text-neutral-500 text-xs uppercase tracking-wide font-medium">STEP 2: </span>
            Pick a lower bitrate
          </li>
          <li>
            <span className="text-neutral-500 text-xs uppercase tracking-wide font-medium">STEP 3: </span>
            Compress the MP3
          </li>
        </ol>
        <FullScreenDropOverlay isDragging={isDragging} onFile={loadFile} />
      </div>
    )
  }

  return (
    <>
      <AlbumArt
        albumArtUrl={albumArtUrl}
        pitchEnabled={false}
        pitchSemitones={0}
        isPlaying={previewPlaying}
        getKickLevel={getKickLevel}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-8 items-start">
        <div className="md:order-2 flex flex-col gap-6 rounded-2xl border border-white/10 bg-black/60 p-6 backdrop-blur-md shadow-2xl">
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-lg bg-elevated border border-white/10 px-4 py-1.5 text-sm text-neutral-300 max-w-full">
              <span className="truncate">{fileName}</span>
              <button
                onClick={stopPreview}
                className="text-neutral-500 hover:text-white ml-1"
                aria-label="Clear file">
                ×
              </button>
            </div>
          </div>

          {buffer && (
            <Waveform
              buffer={buffer}
              duration={duration}
              isPlaying={previewPlaying}
              getPosition={() => heardFrom + (previewRef.current?.currentTime ?? 0)}
              onSeek={seconds => setHeardFrom(Math.max(0, Math.min(seconds, Math.max(0, duration - 0.1))))}
              onTogglePlay={() => {
                const preview = previewRef.current
                if (!preview) return
                if (preview.paused) void preview.play()
                else preview.pause()
              }}
            />
          )}
          {(buffer || previewUrl) && (
            <div className="flex flex-col gap-2">
              <audio
                ref={previewRef}
                src={heardUrl ?? undefined}
                controls
                loop={false}
                className="w-full"
                onPlay={() => setPreviewPlaying(true)}
                onPause={() => setPreviewPlaying(false)}
              />
              {previewUrl && !buffer && duration > PREVIEW_WINDOW_SEC && (
                <label className="flex flex-col gap-1 text-xs text-neutral-400">
                  Preview start
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration - 0.1)}
                    step={1}
                    value={Math.min(heardFrom, Math.max(0, duration - 0.1))}
                    onChange={event => setHeardFrom(Number(event.target.value))}
                  />
                </label>
              )}
              <p className="text-center text-xs text-neutral-500">
                {previewBusy || !heardUrl
                  ? `Preparing the ${chosenKbps ?? ""} kbps preview.`
                  : `Preview is ${chosenKbps} kbps, ${PREVIEW_WINDOW_SEC}s from ${formatClock(heardFrom)}.`}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-center text-xs uppercase tracking-widest text-neutral-400">Bitrate</div>
            {presetsHighFirst.length === 0 ? (
              <p className="text-center text-sm text-neutral-400">Already at the lowest bitrate.</p>
            ) : (
              <>
                <div className="flex flex-wrap justify-center gap-2">
                  {leadPresets.map(kbps => (
                    <button
                      key={kbps}
                      onClick={() => setKbpsIndex(choices.indexOf(kbps))}
                      className={presetBtn(chosenKbps === kbps)}>
                      {kbps} KBPS
                    </button>
                  ))}
                </div>
                {tailPresets.length > 0 && (
                  <>
                    <div className="border-t border-white/10 w-2/3 mx-auto my-1" />
                    <div className="flex flex-wrap justify-center gap-2">
                      {tailPresets.map(kbps => (
                        <button
                          key={kbps}
                          onClick={() => setKbpsIndex(choices.indexOf(kbps))}
                          className={presetBtn(chosenKbps === kbps)}>
                          {kbps} KBPS
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="md:order-1 flex flex-col gap-6 rounded-2xl border border-white/10 bg-black/60 p-6 backdrop-blur-md shadow-2xl">
          {chosenKbps != null && (
            <EffectSliderRow
              label="Bitrate"
              valueDisplay={`(${chosenKbps} kbps)`}
              value={kbpsIndex}
              min={0}
              max={Math.max(0, choices.length - 1)}
              step={1}
              defaultValue={Math.max(0, choices.length - 1)}
              onChange={setKbpsIndex}
            />
          )}

          <div className="flex flex-col items-center gap-1 text-sm text-neutral-300">
            <p>Original {formatBytes(sourceBytes)} · {formatBitrate(sourceBps)}</p>
            {estimate != null && chosenKbps != null && (
              <p>
                Output about {formatBytes(estimate)} · {chosenKbps} kbps · {smallerPct > 0 ? `${smallerPct}% smaller` : "slightly smaller"}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center gap-1 pt-2">
            <button
              type="button"
              onClick={download}
              disabled={isRendering || chosenKbps == null}
              className="px-5 py-2.5 text-sm font-bold bg-neon text-black hover:bg-neon-strong rounded-full transition flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed">
              {encodedReady ? "Download" : "Compress"}
            </button>
            {encodedReady && !isRendering && (
              <p className="text-neutral-500 text-xs">Ready to download. This file and bitrate stay encoded.</p>
            )}
            {isRendering && (
              <div className="flex w-full max-w-xs flex-col gap-1">
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>Encoding</span>
                  <span>{encodePercent ?? 0}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Encoding"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={encodePercent ?? 0}
                  className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
                  <div style={{ width: `${encodePercent ?? 0}%` }} className="h-full bg-neon" />
                </div>
              </div>
            )}
            {estimate != null && (
              <p className="text-neutral-500 text-xs">Output: MP3 · about {formatBytes(estimate)}</p>
            )}
          </div>
        </div>
      </div>

      <FullScreenDropOverlay isDragging={isDragging} onFile={loadFile} />
    </>
  )
}

export default CompressFileEditor
