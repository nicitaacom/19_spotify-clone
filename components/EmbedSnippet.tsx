"use client"

import { useState, useSyncExternalStore } from "react"

import { embedFrameCode } from "@/libs/embedFrame"

function subscribeOrigin() {
  return () => {}
}

export default function EmbedSnippet({ songId }: { songId: string }) {
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => "")
  const [copied, setCopied] = useState(false)
  if (!/^\d+$/.test(songId)) return null
  const code = origin ? embedFrameCode(origin, songId) : ""

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
    <div className="mb-4 rounded-lg border border-white/10 bg-elevated p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm text-white">Paste this iframe on any site. The white button plays song {songId}.</p>
        <button type="button" onClick={() => void copy()} disabled={!code} className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-neon disabled:opacity-40">
          {copied ? "Copied" : "Copy iframe"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs leading-5 text-neutral-300">{code}</pre>
    </div>
  )
}
