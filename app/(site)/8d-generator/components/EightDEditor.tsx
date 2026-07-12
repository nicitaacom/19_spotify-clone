"use client"

import { BiReset } from "react-icons/bi"

import { use8dEngine } from "../hooks/use8dEngine"
import { SPEAKERS } from "../lib/speakers"
import FileDropZone from "../../slow-and-reverb/components/FileDropZone"
import Waveform from "../../slow-and-reverb/components/Waveform"
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
    getCurrentGains,
    togglePlay,
    seek,
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-8 items-start">
      {/* LEFT column (mixers) */}
      <div className="md:order-1 flex flex-col gap-4">
        <div className="rounded-xl border border-white/5 bg-elevated shadow-[0_4px_12px_rgba(0,0,0,0.5)] p-5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-neutral-400 text-sm">Mixers</span>
            <button
              onClick={resetMixers}
              className="flex items-center gap-1 text-neutral-400 hover:text-white text-xs transition-colors"
              aria-label="Reset all mixers">
              <BiReset size={14} /> Reset all
            </button>
          </div>
          <p className="text-neutral-600 text-xs mb-1">
            All at 0 = clean original. Raise a channel to push the sound that way.
          </p>
          <div className="divide-y divide-white/5">
            {SPEAKERS.map((sp, i) => (
              <MixerRow
                key={sp.id}
                label={sp.label}
                value={mixerVolumes[i]}
                onChange={(v) => setMixerVolume(i, v)}
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
      </div>
    </div>
  )
}

export default EightDEditor
