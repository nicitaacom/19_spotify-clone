"use client"

import Slider from "@/components/Slider"

interface MixerRowProps {
  label: string
  value: number // 0–100 (0 = this direction off / clean)
  onChange: (v: number) => void
}

const MixerRow = ({ label, value, onChange }: MixerRowProps) => {
  const active = value > 0
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={`text-sm w-24 shrink-0 ${active ? "text-neon" : "text-neutral-300"}`}>
        {label}
      </span>

      <div className="flex-1">
        <Slider
          value={value}
          onChange={onChange}
          min={0}
          max={100}
          step={1}
          ariaLabel={`${label} level`}
        />
      </div>

      <span className="text-xs text-neutral-500 w-10 text-right tabular-nums">{value}%</span>
    </div>
  )
}

export default MixerRow
