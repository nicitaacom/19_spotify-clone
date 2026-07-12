"use client"

import { useRef, useEffect } from "react"
import { HiSpeakerWave, HiSpeakerXMark } from "react-icons/hi2"

import Slider from "@/components/Slider"

interface MixerRowProps {
  label: string
  value: number // 0–100
  onChange: (v: number) => void
  muted: boolean
}

const MixerRow = ({ label, value, onChange, muted }: MixerRowProps) => {
  // Remember the last nonzero volume so the mute toggle can restore it.
  const lastNonZeroRef = useRef(value > 0 ? value : 100)
  useEffect(() => {
    if (value > 0) lastNonZeroRef.current = value
  }, [value])

  const toggleMute = () => {
    if (value === 0) onChange(lastNonZeroRef.current)
    else onChange(0)
  }

  const Icon = muted ? HiSpeakerXMark : HiSpeakerWave

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-sm text-neutral-300 w-24 shrink-0">{label}</span>

      <div className="flex-1">
        <Slider
          value={value}
          onChange={onChange}
          min={0}
          max={100}
          step={1}
          ariaLabel={`${label} volume`}
        />
      </div>

      <span className="text-xs text-neutral-500 w-10 text-right tabular-nums">{value}%</span>

      <button
        onClick={toggleMute}
        className="text-neutral-400 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors duration-150"
        aria-label={muted ? `Unmute ${label}` : `Mute ${label}`}>
        <Icon size={16} />
      </button>
    </div>
  )
}

export default MixerRow
