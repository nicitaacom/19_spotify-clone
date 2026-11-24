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
    const capture = { capture: true }
    let dragDepth = 0
    let idleTimer: number | undefined
    const hasFiles = (event: DragEvent) => Boolean(
      event.dataTransfer && (
        Array.from(event.dataTransfer.types).includes("Files")
        || Array.from(event.dataTransfer.items).some(item => item.kind === "file")
        || event.dataTransfer.files.length > 0
      ),
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
      const leftWindow = event.relatedTarget === null
        && (event.target === document || event.target === document.documentElement)
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
      if (!hasFiles(event)) {
        reset()
        return
      }
      // Cancel navigation before a child input or modal can stop the event bubbling.
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (onFilesRef.current) {
        reset()
        if (files.length) {
          event.stopPropagation()
          onFilesRef.current(files)
        }
      } else {
        // Leave scoped React drop targets mounted until their onDrop has received this event.
        window.clearTimeout(idleTimer)
        idleTimer = window.setTimeout(reset, 0)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const wasDragging = dragDepth > 0
      reset()
      if (wasDragging) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const handleVisibilityChange = () => {
      if (document.hidden) reset()
    }

    window.addEventListener("dragenter", handleDragEnter, capture)
    window.addEventListener("dragleave", handleDragLeave, capture)
    window.addEventListener("dragover", handleDragOver, capture)
    window.addEventListener("drop", handleDrop, capture)
    window.addEventListener("dragend", reset, capture)
    window.addEventListener("keydown", handleEscape, capture)
    window.addEventListener("pointerdown", reset, capture)
    window.addEventListener("pointermove", reset, capture)
    window.addEventListener("blur", reset)
    window.addEventListener("focus", reset)
    window.addEventListener("pagehide", reset)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearTimeout(idleTimer)
      window.removeEventListener("dragenter", handleDragEnter, capture)
      window.removeEventListener("dragleave", handleDragLeave, capture)
      window.removeEventListener("dragover", handleDragOver, capture)
      window.removeEventListener("drop", handleDrop, capture)
      window.removeEventListener("dragend", reset, capture)
      window.removeEventListener("keydown", handleEscape, capture)
      window.removeEventListener("pointerdown", reset, capture)
      window.removeEventListener("pointermove", reset, capture)
      window.removeEventListener("blur", reset)
      window.removeEventListener("focus", reset)
      window.removeEventListener("pagehide", reset)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  return { isDragging, setIsDragging }
}
