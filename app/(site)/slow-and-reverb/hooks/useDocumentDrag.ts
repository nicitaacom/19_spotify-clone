"use client"

import { useState, useEffect } from "react"

export function useDocumentDrag() {
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDragging(true)
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDragging(false)
      }
    }

    const handleDrop = () => {
      setIsDragging(false)
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
    }

    document.addEventListener("dragenter", handleDragEnter)
    document.addEventListener("dragleave", handleDragLeave)
    document.addEventListener("drop", handleDrop)
    document.addEventListener("dragover", handleDragOver)

    return () => {
      document.removeEventListener("dragenter", handleDragEnter)
      document.removeEventListener("dragleave", handleDragLeave)
      document.removeEventListener("drop", handleDrop)
      document.removeEventListener("dragover", handleDragOver)
    }
  }, [])

  return { isDragging, setIsDragging }
}
