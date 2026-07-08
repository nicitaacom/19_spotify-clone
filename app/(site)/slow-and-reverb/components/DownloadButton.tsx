"use client"

import { BeatLoader } from "react-spinners"

interface DownloadButtonProps {
  onDownload: () => void
  isRendering: boolean
  disabled?: boolean
}

const DownloadButton = ({ onDownload, isRendering, disabled }: DownloadButtonProps) => {
  const handleClick = () => {
    if (isRendering || disabled) return
    onDownload()
  }

  return (
    <button
      onClick={handleClick}
      disabled={isRendering || disabled}
      className="px-5 py-2.5 text-sm font-bold bg-neon text-black hover:bg-neon-strong rounded-full transition flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isRendering ? <BeatLoader size={8} color="#000" /> : "Download"}
    </button>
  )
}

export default DownloadButton
