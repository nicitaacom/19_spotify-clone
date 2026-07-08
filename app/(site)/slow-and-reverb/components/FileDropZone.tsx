"use client"

import { useState, useRef } from "react"
import { FiUploadCloud } from "react-icons/fi"
import { toast } from "react-hot-toast"
import { twMerge } from "tailwind-merge"

interface FileDropZoneProps {
  onFile: (file: File) => void
}

const FileDropZone = ({ onFile }: FileDropZoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (file.type.startsWith("audio/")) {
      onFile(file)
    } else {
      toast.error("Please select an audio file")
    }
  }

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  return (
    <div
      onClick={handleClick}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={twMerge(
        "rounded-xl border-2 border-dashed border-white/10 bg-elevated/50 p-12 text-center cursor-pointer transition",
        isDragOver && "border-neon/50 bg-elevated",
      )}>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || undefined)}
      />
      <div className="flex flex-col items-center gap-4">
        <FiUploadCloud size={48} className="text-neutral-400" />
        <p className="text-neutral-300">🎵 Drop an MP3 here or click to browse</p>
        <p className="text-neutral-500 text-xs">MP3 recommended • pitch + reverb + bass in browser</p>
      </div>
    </div>
  )
}

export default FileDropZone
