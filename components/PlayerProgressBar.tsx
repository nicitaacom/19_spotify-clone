"use client"

import usePlayer from "@/hooks/usePlayer"
import usePlayerProgress from "@/hooks/usePlayerProgress"

// The one reader of progress - it renders every 400ms, Player and PlayerContent no longer do
const PlayerProgressBar = () => {
  const { progress, setProgress } = usePlayerProgress()
  const { requestSeek } = usePlayer()

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const nextProgress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setProgress(nextProgress)
    requestSeek(nextProgress)
  }

  return (
    <div
      onClick={handleSeek}
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
        group/progress
      ">
      <div className="relative h-[3px] w-full bg-elevated">
        <div style={{ width: `${progress * 100}%` }} className="relative h-full bg-neon shadow-neon-sm">
          <div
            className="absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-neon shadow-neon-sm transition-transform hover:scale-110"
          />
        </div>
      </div>
    </div>
  )
}

export default PlayerProgressBar
