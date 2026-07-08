"use client"

import * as RadixSlider from "@radix-ui/react-slider"
import { twMerge } from "tailwind-merge"

interface SlideProps {
  value?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
  className?: string
}

const Slider: React.FC<SlideProps> = ({
  value = 1,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
  ariaLabel = "Volume",
  className,
}) => {
  const handleChange = (newValue: number[]) => {
    onChange?.(newValue[0])
  }

  return (
    <RadixSlider.Root
      className={twMerge(
        `
        relative 
        flex 
        items-center 
        select-none 
        touch-none 
        w-full 
        h-10
      `,
        className,
      )}
      defaultValue={[value]}
      value={[value]}
      onValueChange={handleChange}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}>
      <RadixSlider.Track
        className="
          bg-neutral-600 
          relative 
          grow 
          rounded-full 
          h-[3px]
        ">
        <RadixSlider.Range
          className="
            absolute 
            bg-white 
            rounded-full 
            h-full
          "
        />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        className="
          block 
          w-3 
          h-3 
          bg-white 
          shadow-md 
          rounded-full 
          hover:scale-110 
          focus:outline-none 
          transition
        "
        aria-label={ariaLabel}
      />
    </RadixSlider.Root>
  )
}

export default Slider
