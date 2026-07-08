"use client"

import { useState } from "react"
import ProBadge from "./ProBadge"

interface PitchToggleRowProps {
  speed: number
}

const PitchToggleRow = ({ speed }: PitchToggleRowProps) => {
  const [on, setOn] = useState(true)

  const handleToggleClick = () => {
    setOn((prev) => !prev)
  }

  const dotClass = on
    ? "absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-neon transition-transform translate-x-[16px]"
    : "absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-neutral-500 transition-transform translate-x-0"

  const valueClass = on ? "text-neutral-300" : "text-neutral-300 opacity-50"
  const badgeClass = on ? "" : "opacity-50"

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-3 text-sm">
        <button
          onClick={handleToggleClick}
          className="w-10 h-6 rounded-full bg-elevated border border-white/10 relative flex items-center cursor-pointer"
          aria-label="Pitch (linked)">
          <div className={dotClass} />
        </button>

        <span className={valueClass}>
          Pitch <span className="font-medium text-white">({speed.toFixed(2)}x)</span>
        </span>

        <div className={badgeClass}>
          <ProBadge />
        </div>

        <span className="text-[10px] uppercase rounded-full px-1.5 py-0.5 bg-white/10 text-neutral-300">
          BETA
        </span>
      </div>

      <p className="text-neutral-500 text-xs">Pitch follows speed (linked)</p>
    </div>
  )
}

export default PitchToggleRow
