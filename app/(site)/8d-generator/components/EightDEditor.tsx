"use client"

import { BiReset } from "react-icons/bi"
import { twMerge } from "tailwind-merge"

import { use8dEngine } from "../hooks/use8dEngine"
import { SPEAKERS } from "../lib/speakers"
import FileDropZone from "../../slow-and-reverb/components/FileDropZone"
import Waveform from "../../slow-and-reverb/components/Waveform"
import EffectSliderRow from "../../slow-and-reverb/components/EffectSliderRow"
import { formatTime } from "../../slow-and-reverb/lib/format"
import SpeakerRing from "./SpeakerRing"
import MixerRow from "./MixerRow"
import DownloadButton from "./DownloadButton"

const HeadphonesHint = () => (
  <div className="flex items-center justify-center gap-2 text-neutral-500 text-xs">
    🎧 Use headphones — 8D only works with headphones
  </div>
)

const EightDEditor = () => {
  const {
    loadFile,
    clear,
    fileName,
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
  } = use8dEngine()

  const isEmpty = !buffer || !fileName

  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center gap-6">
        <HeadphonesHint />
        <FileDropZone onFile={loadFile} />
      </div>
    )
  }

  const dirBtn = (active: boolean) =>
    twMerge(
      "px-4 py-1.5 rounded-md text-xs border transition",
      active
        ? "bg-elevated border-neon/30 text-neon"
        : "bg-elevated border-white/10 text-neutral-300 hover:border-neon/30 hover:text-white",
    )

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-8 items-start">
      {/* LEFT column (mixers) */}
      <div className="md:order-1 flex flex-col gap-4">
        <div className="rounded-xl border border-white/5 bg-elevated shadow-[0_4px_12px_rgba(0,0,0,0.5)] p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-neutral-400 text-sm">Mixers</span>
            <button
              onClick={resetMixers}
              className="flex items-center gap-1 text-neutral-400 hover:text-white text-xs transition-colors"
              aria-label="Reset all mixers">
              <BiReset size={14} /> Reset all
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {SPEAKERS.map((sp, i) => (
              <MixerRow
                key={sp.id}
                label={sp.label}
                value={mixerVolumes[i]}
                onChange={(v) => setMixerVolume(i, v)}
                muted={mixerVolumes[i] === 0}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 pt-2">
          <DownloadButton onDownload={download} isRendering={isRendering} disabled={!buffer} />
          <p className="text-neutral-500 text-xs">
            Output: MP3 320 kbps · {formatTime(duration)}
          </p>
          <HeadphonesHint />
        </div>
      </div>

      {/* RIGHT column (media) */}
      <div className="md:order-2 flex flex-col gap-6">
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

        {/* speaker ring */}
        <div className="rounded-xl border border-white/5 bg-elevated shadow-[0_4px_12px_rgba(0,0,0,0.5)] p-5">
          <SpeakerRing
            isPlaying={isPlaying}
            getOrbitAngle={getOrbitAngle}
            getCurrentGains={getCurrentGains}
            mixerVolumes={mixerVolumes}
          />
        </div>

        {/* waveform */}
        <div className="rounded-xl border border-white/5 bg-elevated shadow-[0_4px_12px_rgba(0,0,0,0.5)] p-5">
          <Waveform
            buffer={buffer}
            duration={duration}
            isPlaying={isPlaying}
            getPosition={getPosition}
            onSeek={seek}
            onTogglePlay={togglePlay}
          />
        </div>

        {/* rotation controls */}
        <div className="flex flex-col gap-4">
          <EffectSliderRow
            label="Rotation"
            valueDisplay={`(${rotationPeriod.toFixed(1)}s / rev)`}
            value={rotationPeriod}
            min={2}
            max={20}
            step={0.5}
            defaultValue={8}
            onChange={setRotationPeriod}
          />

          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="text-neutral-400">Direction</span>
            <button onClick={() => setDirection(1)} className={dirBtn(direction === 1)}>
              CW
            </button>
            <button onClick={() => setDirection(-1)} className={dirBtn(direction === -1)}>
              CCW
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EightDEditor
