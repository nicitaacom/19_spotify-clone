"use client"

import { FiUploadCloud } from "react-icons/fi"
import { toast } from "react-hot-toast"

interface FullScreenDropOverlayProps {
  isDragging: boolean
  onFile: (file: File) => void
}

export default function FullScreenDropOverlay({ isDragging, onFile }: FullScreenDropOverlayProps) {
  if (!isDragging) return null

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (file.type.startsWith("audio/")) {
      onFile(file)
    } else {
      toast.error("Please select an audio file")
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-auto"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="absolute inset-8 rounded-xl border-2 border-dashed border-neon/50 bg-dark-base/80 backdrop-blur-sm flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-neutral-300">
          <FiUploadCloud size={48} className="text-neon" />
          <p className="text-lg">Drop your audio file anywhere</p>
        </div>
      </div>
    </div>
  )
}
