"use client"

import { useCallback } from "react"
import ProBadge from "./ProBadge"
import EffectSliderRow from "./EffectSliderRow"

interface PitchToggleRowProps {
  pitch: number
  pitchEnabled: boolean
  setPitchEnabled: (enabled: boolean) => void
  setPitch: (v: number) => void
  speed: number
}

const PitchToggleRow = ({
  pitch,
  pitchEnabled,
  setPitchEnabled,
  setPitch,
  speed,
}: PitchToggleRowProps) => {
  const handleToggle = useCallback(() => {
    setPitchEnabled(!pitchEnabled)
  }, [pitchEnabled, setPitchEnabled])

  const dotClass = pitchEnabled
    ? "absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-neon transition-transform translate-x-[16px]"
    : "absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-neutral-500 transition-transform translate-x-0"

  const valueClass = pitchEnabled ? "text-neutral-300" : "text-neutral-300 opacity-50"
  const badgeClass = pitchEnabled ? "" : "opacity-50"

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-3 text-sm">
        <button
          onClick={handleToggle}
          className="w-10 h-6 rounded-full bg-elevated border border-white/10 relative flex items-center cursor-pointer"
          aria-label="Toggle independent pitch"
        >
          <div className={dotClass} />
        </button>

        <span className={valueClass}>
          Pitch <span className="font-medium text-white">({pitch.toFixed(2)}x)</span>
        </span>

        <div className={badgeClass}>
          <ProBadge />
        </div>
      </div>

      <p className="text-neutral-500 text-xs">
        {pitchEnabled ? "Independent pitch" : "Pitch follows speed (linked)"}
      </p>

      {/* Real pitch slider when independent mode is on */}
      {pitchEnabled && (
        <div className="w-full mt-1">
          <EffectSliderRow
            label="Pitch"
            valueDisplay={`(${pitch.toFixed(2)}x)`}
            value={pitch}
            min={0.5}
            max={1.5}
            step={0.05}
            defaultValue={speed}
            onChange={setPitch}
          />
        </div>
      )}
    </div>
  )
}

export default PitchToggleRow
