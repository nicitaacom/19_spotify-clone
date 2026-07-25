"use client"

import type { ErrorInfo } from "next/error"
import { useEffect } from "react"

import useOnlineStatus from "@/hooks/useOnlineStatus"

export default function RootError({ error, unstable_retry }: ErrorInfo) {
  const isOnline = useOnlineStatus()

  useEffect(() => {
    console.error("[app] route error", error)
  }, [error])

  return (
    <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg bg-surface px-6 text-white">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-neon/30 bg-neon/10 text-2xl">
          {isOnline ? "!" : "↯"}
        </div>
        <h2 className="text-xl font-semibold">{isOnline ? "This page could not load" : "You’re offline"}</h2>
        <p className="text-sm leading-6 text-neutral-400">
          {isOnline
            ? "The connection may have changed while the page was loading. Your open player state is safe."
            : "The current page remains available, but loading another page requires an internet connection."}
        </p>
        <button
          type="button"
          disabled={!isOnline}
          onClick={() => unstable_retry()}
          className="rounded-full bg-neon px-5 py-2 text-sm font-semibold text-black transition hover:bg-neon-strong disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400">
          {isOnline ? "Try again" : "Waiting for connection…"}
        </button>
      </div>
    </div>
  )
}
