"use client"

import { useMemo } from "react"
import { twMerge } from "tailwind-merge"

import { useSlowReverbEngine } from "../hooks/useSlowReverbEngine"
import FileDropZone from "./FileDropZone"
import Waveform from "./Waveform"
import EffectSliderRow from "./EffectSliderRow"
import PitchToggleRow from "./PitchToggleRow"
import DownloadButton from "./DownloadButton"
import ProBadge from "./ProBadge"
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
    pitch,
    setPitch,
    pitchEnabled,
    setPitchEnabled,
    applyPreset,
    isRendering,
    download,
    clear,
  } = engine

  const isSlowed = useMemo(() => speed === 0.8 && reverb === 40, [speed, reverb])
  const isNightcore = useMemo(() => speed === 1.25 && reverb === 0, [speed, reverb])

  const presetBtn = (active: boolean) =>
    twMerge(
      "px-4 py-1.5 rounded-full text-sm border transition",
      active
        ? "bg-elevated border-neon/30 text-neon shadow-neon-sm"
        : "bg-elevated border-white/10 text-neutral-300 hover:border-neon/30 hover:text-white",
    )

  if (!buffer || !fileName) {
    return <FileDropZone onFile={loadFile} />
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
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
        <div className="flex justify-center gap-2">
          <button onClick={() => applyPreset("slowed")} className={presetBtn(isSlowed)}>
            Slowed + Reverb
          </button>
          <button onClick={() => applyPreset("nightcore")} className={presetBtn(isNightcore)}>
            Nightcore
          </button>
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
        speed={speed}
        pitch={pitch}
        pitchEnabled={pitchEnabled}
        setPitchEnabled={setPitchEnabled}
        setPitch={setPitch}
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
