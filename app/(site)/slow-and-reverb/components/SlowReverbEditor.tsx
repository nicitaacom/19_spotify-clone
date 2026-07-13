"use client"

import { useEffect } from "react"
import { twMerge } from "tailwind-merge"

import { useSlowReverbEngine } from "../hooks/useSlowReverbEngine"
import FileDropZone from "./FileDropZone"
import Waveform from "./Waveform"
import EffectSliderRow from "./EffectSliderRow"
import PitchToggleRow from "./PitchToggleRow"
import DownloadButton from "./DownloadButton"
import ProBadge from "./ProBadge"
import AlbumArt from "./AlbumArt"
import FullScreenDropOverlay from "./FullScreenDropOverlay"
import { useDocumentDrag } from "../hooks/useDocumentDrag"
import { formatTime } from "../lib/format"

interface Preset {
  label: string
  speed: number
  reverb: number
  bass: number
  pitchSt: number
}

// §12.10.A — the six canonical presets (separator after the first three)
const PRESETS: Preset[] = [
  { label: "SLOWED&REVERB", speed: 0.8, reverb: 40, bass: 5, pitchSt: 0 },
  { label: "SUPER SLOWED&REVERB", speed: 0.7, reverb: 40, bass: 10, pitchSt: 0 },
  { label: "ULTRA SLOWED&REVERB", speed: 0.6, reverb: 40, bass: 20, pitchSt: 0 },
]

const CUSTOM_PRESETS: Preset[] = [
  { label: "PRESET 1", speed: 0.85, reverb: 60, bass: 20, pitchSt: -4 },
  { label: "PRESET 2", speed: 0.8, reverb: 50, bass: 30, pitchSt: -6 },
  { label: "PRESET 3", speed: 0.75, reverb: 40, bass: 35, pitchSt: -7 },
]

const SlowReverbEditor = () => {
  const engine = useSlowReverbEngine()
  const {
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
  } = engine

  const { isDragging } = useDocumentDrag()

  // §12.10.C — whole-site dim driven by pitch. Sets a CSS var on <html> that the
  // server page shell consumes as its background-color. Less pitch → darker.
  useEffect(() => {
    const dim = pitchEnabled ? pitchSemitones / 12 : 0
    let channel: number
    if (dim < 0) {
      channel = Math.round(17 * (1 + dim * 0.6)) // → #070707 at −12 st
    } else {
      channel = Math.round(17 + dim * 16) // → #212121 at +12 st
    }
    const hex = channel.toString(16).padStart(2, "0")
    document.documentElement.style.setProperty("--srv-bg", `#${hex}${hex}${hex}`)
    return () => {
      document.documentElement.style.removeProperty("--srv-bg")
    }
  }, [pitchEnabled, pitchSemitones])

  // Spacebar toggles play/pause (unless typing in an input). Prevents the default page
  // scroll and works no matter which control has focus, so pressing the play button and
  // then Space doesn't get swallowed by the button's own click handling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return
      if (!buffer) return
      e.preventDefault()
      el?.blur() // drop focus from the play button so it can't double-handle the key
      togglePlay()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [buffer, togglePlay])

  const presetBtn = (active: boolean) =>
    twMerge(
      "px-4 py-1.5 rounded-md text-xs border transition",
      active
        ? "bg-elevated border-neon/30 text-neon shadow-neon-sm"
        : "bg-elevated border-white/10 text-neutral-300 hover:border-neon/30 hover:text-white",
    )

  const isPresetActive = (p: Preset) =>
    speed === p.speed &&
    reverb === p.reverb &&
    bass === p.bass &&
    pitchSemitones === p.pitchSt &&
    pitchEnabled === (p.pitchSt !== 0)

  const isEmpty = !buffer || !fileName

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center">
        <FileDropZone onFile={loadFile} />

        {/* 12.6 Empty state: 4-step guide */}
        <ol className="flex flex-col gap-1.5 text-sm text-neutral-400 items-center mt-6">
          <li>
            <span className="text-neutral-500 text-xs uppercase tracking-wide font-medium">STEP 1: </span>
            <a
              href="https://www.dermabox.pl/#u=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DFeKOxDT-XFQ"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neon hover:text-neon-strong underline underline-offset-2"
            >
              Download song
            </a>
          </li>
          <li>
            <span className="text-neutral-500 text-xs uppercase tracking-wide font-medium">STEP 2: </span>
            Upload song
          </li>
          <li>
            <span className="text-neutral-500 text-xs uppercase tracking-wide font-medium">STEP 3: </span>
            Try different presets
          </li>
          <li>
            <span className="text-neutral-500 text-xs uppercase tracking-wide font-medium">STEP 4: </span>
            Download song
          </li>
        </ol>

        <FullScreenDropOverlay isDragging={isDragging} onFile={loadFile} />
      </div>
    )
  }

  return (
    <>
      {/* full-page background built from the track's embedded cover */}
      <AlbumArt
        albumArtUrl={albumArtUrl}
        pitchEnabled={pitchEnabled}
        pitchSemitones={pitchSemitones}
        isPlaying={isPlaying}
        getKickLevel={getKickLevel}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-8 items-start">
        {/* RIGHT section (media): filename, waveform, presets */}
        <div className="md:order-2 flex flex-col gap-6 rounded-2xl border border-white/10 bg-black/60 p-6 backdrop-blur-md shadow-2xl">
          {/* filename pill */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-lg bg-elevated border border-white/10 px-4 py-1.5 text-sm text-neutral-300 max-w-full">
              <span className="truncate">{fileName}</span>
              <button
                onClick={clear}
                className="text-neutral-500 hover:text-white ml-1"
                aria-label="Clear file">
                ×
              </button>
            </div>
          </div>

          {/* waveform */}
          <Waveform
            buffer={buffer}
            duration={duration}
            isPlaying={isPlaying}
            getPosition={getPosition}
            onSeek={seek}
            onTogglePlay={togglePlay}
          />

          {/* presets */}
          <div className="flex flex-col gap-2">
            <div className="text-center text-xs uppercase tracking-widest text-neutral-400">Presets</div>
            <div className="flex flex-wrap justify-center gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => applyPreset(p)} className={presetBtn(isPresetActive(p))}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 w-2/3 mx-auto my-1" />
            <div className="flex flex-wrap justify-center gap-2">
              {CUSTOM_PRESETS.map((p) => (
                <button key={p.label} onClick={() => applyPreset(p)} className={presetBtn(isPresetActive(p))}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* LEFT section (inputs): speed, reverb, pitch, bass, download */}
        <div className="md:order-1 flex flex-col gap-6 rounded-2xl border border-white/10 bg-black/60 p-6 backdrop-blur-md shadow-2xl">
          {/* speed */}
          <EffectSliderRow
            label="Speed"
            valueDisplay={`(${speed.toFixed(2)}x)`}
            value={speed}
            min={0.5}
            max={1.5}
            step={0.05}
            defaultValue={1}
            onChange={setSpeed}
          />

          {/* reverb */}
          <EffectSliderRow
            label="Reverb"
            valueDisplay={`(${reverb}%)`}
            value={reverb}
            min={0}
            max={100}
            step={1}
            defaultValue={0}
            onChange={setReverb}
          />

          {/* pitch toggle + optional independent slider */}
          <PitchToggleRow
            pitchSemitones={pitchSemitones}
            pitchEnabled={pitchEnabled}
            setPitchEnabled={setPitchEnabled}
            setPitchSemitones={setPitchSemitones}
          />

          {/* bass */}
          <EffectSliderRow
            label="Bass boost"
            valueDisplay={`(${bass}%)`}
            value={bass}
            min={0}
            max={100}
            step={1}
            defaultValue={0}
            onChange={setBass}
            badge={<ProBadge />}
          />

          {/* download */}
          <div className="flex flex-col items-center gap-1 pt-2">
            <DownloadButton
              onDownload={download}
              isRendering={isRendering}
              disabled={!buffer}
            />
            <p className="text-neutral-500 text-xs">
              Output length: {formatTime(duration / Math.max(0.1, speed))}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default SlowReverbEditor
