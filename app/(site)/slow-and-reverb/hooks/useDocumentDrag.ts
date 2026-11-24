"use client"

import { useState, useEffect, useRef } from "react"

const DRAG_IDLE_MS = 1500

export function useDocumentDrag(onFiles?: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false)
  const onFilesRef = useRef(onFiles)

  useEffect(() => {
    onFilesRef.current = onFiles
  })

  useEffect(() => {
    let dragDepth = 0
    let idleTimer: number | undefined
    const hasFiles = (event: DragEvent) =>
      Boolean(
        event.dataTransfer &&
        (Array.from(event.dataTransfer.types).includes("Files") ||
          Array.from(event.dataTransfer.items).some(item => item.kind === "file") ||
          event.dataTransfer.files.length > 0),
      )

    const reset = () => {
      window.clearTimeout(idleTimer)
      dragDepth = 0
      setIsDragging(false)
    }

    const markDragging = () => {
      setIsDragging(true)
      window.clearTimeout(idleTimer)
      // External drags can end without sending this page drop, dragleave, or dragend.
      idleTimer = window.setTimeout(reset, DRAG_IDLE_MS)
    }

    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth++
      markDragging()
    }

    const handleDragLeave = (event: DragEvent) => {
      dragDepth = Math.max(0, dragDepth - 1)
      const leftWindow =
        event.relatedTarget === null && (event.target === document || event.target === document.documentElement)
      if (dragDepth === 0 || leftWindow) reset()
    }

    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
      dragDepth = Math.max(1, dragDepth)
      markDragging()
    }

    const handleDrop = (event: DragEvent) => {
      reset()
      if (!hasFiles(event)) return
      // Cancel navigation before a child input or modal can stop the event bubbling.
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (onFilesRef.current && files.length) {
        event.stopPropagation()
        onFilesRef.current(files)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") reset()
    }
    const handleVisibilityChange = () => {
      if (document.hidden) reset()
    }

    window.addEventListener("dragenter", handleDragEnter, true)
    window.addEventListener("dragleave", handleDragLeave, true)
    window.addEventListener("dragover", handleDragOver, true)
    window.addEventListener("drop", handleDrop, true)
    window.addEventListener("dragend", reset, true)
    window.addEventListener("keydown", handleEscape, true)
    window.addEventListener("pointerdown", reset, true)
    window.addEventListener("pointermove", reset, true)
    window.addEventListener("blur", reset)
    window.addEventListener("focus", reset)
    window.addEventListener("pagehide", reset)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearTimeout(idleTimer)
      window.removeEventListener("dragenter", handleDragEnter, true)
      window.removeEventListener("dragleave", handleDragLeave, true)
      window.removeEventListener("dragover", handleDragOver, true)
      window.removeEventListener("drop", handleDrop, true)
      window.removeEventListener("dragend", reset, true)
      window.removeEventListener("keydown", handleEscape, true)
      window.removeEventListener("pointerdown", reset, true)
      window.removeEventListener("pointermove", reset, true)
      window.removeEventListener("blur", reset)
      window.removeEventListener("focus", reset)
      window.removeEventListener("pagehide", reset)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return { isDragging, setIsDragging }
}
