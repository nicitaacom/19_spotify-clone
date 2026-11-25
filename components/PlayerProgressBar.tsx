"use client"

import { useState } from "react"

import usePlayer from "@/hooks/usePlayer"
import usePlayerProgress from "@/hooks/usePlayerProgress"

// The one reader of progress - it renders every 400ms, Player and PlayerContent no longer do
const PlayerProgressBar = () => {
  const { progress, setProgress } = usePlayerProgress()
  const { requestSeek } = usePlayer()

  // where the bar is dragged to, null = not dragged - apart from progress, which the 400ms interval sets
  const [dragProgress, setDragProgress] = useState<number | null>(null)

  const getPointerProgress = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  // the pointer is captured - the drag goes on above the bar and outside the window / the iframe
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragProgress(getPointerProgress(e))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragProgress !== null) setDragProgress(getPointerProgress(e))
  }

  // 1 seek on release (a click is a drag of 0 px) - a seek per move asks for the audio file again on each one
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragProgress === null) return
    const nextProgress = getPointerProgress(e)
    setDragProgress(null)
    setProgress(nextProgress)
    requestSeek(nextProgress)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragProgress(null)}
      className="
        absolute
        -top-2
        left-0
        w-full
        h-5
        z-20
        flex
        items-center
        cursor-pointer
        touch-none
        select-none
        group/progress
      ">
      <div className="relative h-[3px] w-full bg-elevated">
        <div style={{ width: `${(dragProgress ?? progress) * 100}%` }} className="relative h-full bg-neon shadow-neon-sm">
          <div
            className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-neon shadow-neon-sm transition-transform hover:scale-110"
          />
        </div>
      </div>
    </div>
  )
}

export default PlayerProgressBar
