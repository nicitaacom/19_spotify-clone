"use client"

import React from "react"

interface ProgressBarProps {
  progress: number
  speed: string
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, speed }) => {
  return (
    <div className="flex flex-col gap-y-2 w-full">
      <div className="flex justify-between items-center text-xs text-neutral-400">
        <span>Uploading... {Math.round(progress)}%</span>
        <span>{speed}</span>
      </div>
      <div className="h-[4px] w-full bg-neutral-600 rounded-full overflow-hidden">
        <div
          style={{ width: `${progress}%` }}
          className="h-full bg-neon shadow-neon-sm transition-all duration-300 ease-out"
        />
      </div>
    </div>
  )
}

export default ProgressBar
