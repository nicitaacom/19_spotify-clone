"use client"

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
  } = engine

  const { isDragging } = useDocumentDrag()


  const presetBtn = (active: boolean) =>
    twMerge(
      "px-4 py-1.5 rounded-full text-sm border transition",
      active
        ? "bg-elevated border-neon/30 text-neon shadow-neon-sm"
        : "bg-elevated border-white/10 text-neutral-300 hover:border-neon/30 hover:text-white",
    )

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
              href="https://yt1z.io/en/video/FeKOxDT-XFQ"
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
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6 relative">
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

      <AlbumArt albumArtUrl={albumArtUrl} pitchEnabled={pitchEnabled} pitchSemitones={pitchSemitones} />

      {/* pitch-reactive dim overlay */}
      {pitchEnabled && (
        <div className="absolute inset-0 bg-black/40 pointer-events-none rounded-2xl z-0" />
      )}

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
        <div className="flex justify-center gap-3">
          <button onClick={() => applyPreset("lofi")} className={presetBtn(false)}>Lofi</button>
          <button onClick={() => applyPreset("dreamy")} className={presetBtn(false)}>Dreamy</button>
          <button onClick={() => applyPreset("vinyl")} className={presetBtn(false)}>Vinyl</button>
        </div>
      </div>

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
  )
}

export default SlowReverbEditor
