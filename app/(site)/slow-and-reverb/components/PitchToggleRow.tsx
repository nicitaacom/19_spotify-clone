"use client"

import ProBadge from "./ProBadge"

interface PitchToggleRowProps {
  speed: number
}

const PitchToggleRow = ({ speed }: PitchToggleRowProps) => {
  // Fake always-on toggle (pitch is linked, decorative only)
  const handleToggleClick = () => {
    // intentionally does nothing beyond visual
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-3 text-sm">
        {/* fake switch */}
        <button
          onClick={handleToggleClick}
          className="w-10 h-6 rounded-full bg-elevated border border-white/10 relative flex items-center cursor-default"
          aria-label="Pitch (linked)">
          <div className="absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-neon transition-transform translate-x-[16px]" />
        </button>

        <span className="text-neutral-300">
          Pitch <span className="font-medium text-white">({speed.toFixed(2)}x)</span>
        </span>

        <ProBadge />

        <span className="text-[10px] uppercase rounded-full px-1.5 py-0.5 bg-white/10 text-neutral-300">
          BETA
        </span>
      </div>

      <p className="text-neutral-500 text-xs">Pitch follows speed (linked)</p>
    </div>
  )
}

export default PitchToggleRow
