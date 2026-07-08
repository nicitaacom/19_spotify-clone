"use client"

import { useState, useRef, useCallback } from "react"
import { TbRefresh } from "react-icons/tb"
import { BsThreeDotsVertical } from "react-icons/bs"

import Slider from "@/components/Slider"
import useOnEscOrClickOutside from "@/hooks/useOnEscOrClickOutside"

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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useOnEscOrClickOutside(menuRef, () => setMenuOpen(false), menuOpen)

  const handleReset = useCallback(() => {
    onChange(defaultValue)
    setMenuOpen(false)
  }, [onChange, defaultValue])

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
        {/* reset left */}
        <button
          onClick={() => onChange(defaultValue)}
          className="text-neutral-400 hover:text-white p-1 transition"
          aria-label="Reset">
          <TbRefresh size={16} />
        </button>

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

        {/* 3-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="text-neutral-400 hover:text-white p-1 transition"
            aria-label="More options">
            <BsThreeDotsVertical size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 min-w-[120px] rounded-md border border-white/10 bg-elevated py-1 shadow-lg text-sm">
              <button
                onClick={handleReset}
                className="w-full px-4 py-1.5 text-left hover:bg-white/5 text-neutral-300 hover:text-white">
                Reset
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EffectSliderRow
