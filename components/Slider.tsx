"use client"

import * as RadixSlider from "@radix-ui/react-slider"

interface SlideProps {
  value?: number
  onChange?: (value: number) => void
}

const Slider: React.FC<SlideProps> = ({ value = 1, onChange }) => {
  const handleChange = (newValue: number[]) => {
    onChange?.(newValue[0])
  }

  return (
    <RadixSlider.Root
      className="
        relative 
        flex 
        items-center 
        select-none 
        touch-none 
        w-full 
        h-10
      "
      defaultValue={[1]}
      value={[value]}
      onValueChange={handleChange}
      max={1}
      step={0.1}
      aria-label="Volume">
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
        aria-label="Volume"
      />
    </RadixSlider.Root>
  )
}

export default Slider
