"use client"

import { BiReset } from "react-icons/bi"

import Slider from "@/components/Slider"

interface EffectSliderRowProps {
  label: string
  valueDisplay: string
  value: number
  min: number
  max: number
  step: number
  defaultValue: number
  onChange: (v: number) => void
  badge?: React.ReactNode
}

const EffectSliderRow = ({
  label,
  valueDisplay,
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
  badge,
}: EffectSliderRowProps) => {
  return (
    <div className="flex flex-col gap-2">
      {/* label line */}
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="text-neutral-400">
          {label} <span className="text-neutral-300 font-medium">{valueDisplay}</span>
        </span>
        {badge}
      </div>

      <div className="flex items-center gap-3">
        {/* slider center */}
        <div className="flex-1">
          <Slider
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            step={step}
            ariaLabel={label}
          />
        </div>

        {/* single reset icon on the right */}
        <button
          onClick={() => onChange(defaultValue)}
          className="text-neutral-400 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors duration-150"
          aria-label="Reset">
          <BiReset size={16} />
        </button>
      </div>
    </div>
  )
}

export default EffectSliderRow
