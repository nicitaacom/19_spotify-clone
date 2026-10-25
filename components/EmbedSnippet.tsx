"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { FiCode } from "react-icons/fi"

import { embedFrameCode } from "@/libs/embedFrame"

function subscribeOrigin() {
  return () => {}
}

export default function EmbedSnippet({ songId }: { songId: string }) {
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => "")
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const snippetId = useId()
  const code = /^\d+$/.test(songId) && origin ? embedFrameCode(origin, songId) : ""

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target
      if (!(node instanceof Node) || !rootRef.current?.contains(node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  if (!/^\d+$/.test(songId)) return null

  const toggle = () => {
    setCopied(false)
    setOpen(current => !current)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch (error) {
      setCopied(false)
      console.error(error)
    }
  }

  return (
    <div ref={rootRef} className="contents">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={snippetId}
        onClick={toggle}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition focus-visible:outline-neon ${
          open ? "border-neon/40 bg-neon/10 text-neon" : "border-white/10 text-neutral-300 hover:border-white/25"
        }`}>
        <FiCode size={14} />
        iframe
      </button>
      {open && (
        <div id={snippetId} className="basis-full rounded-lg border border-white/10 bg-elevated p-3">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => void copy()}
              disabled={!code}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-neon disabled:opacity-40">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs leading-5 text-neutral-300">{code}</pre>
        </div>
      )}
    </div>
  )
}
