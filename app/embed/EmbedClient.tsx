"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useSearchParams } from "next/navigation"

import MusicRecommendation from "@/components/MusicRecommendation"
import { errorText, httpErrorMessage } from "@/libs/errorText"

const HIDDEN_KEY = "music-recommendation-hidden"
const hiddenListeners = new Set<() => void>()
let hiddenInMemory = false

function readHidden() {
  if (hiddenInMemory) return true
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1"
  } catch {
    return false
  }
}

function subscribeHidden(listener: () => void) {
  hiddenListeners.add(listener)
  return () => hiddenListeners.delete(listener)
}

function hideRecommendation() {
  hiddenInMemory = true
  try {
    window.localStorage.setItem(HIDDEN_KEY, "1")
  } catch {
    // A host page can block storage. This document still hides the pill.
  }
  hiddenListeners.forEach(listener => listener())
}

export default function EmbedClient() {
  const searchParams = useSearchParams()
  const requestedSongId = searchParams.get("songId")?.trim() ?? ""
  const tags = searchParams.get("tags")?.trim() ?? ""
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => false)
  const [songId, setSongId] = useState(requestedSongId)
  const [track, setTrack] = useState(requestedSongId ? "Song" : "Music recommendation")
  const [isPlaying, setIsPlaying] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [playError, setPlayError] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamUrlRef = useRef("")

  useEffect(() => {
    const controller = new AbortController()
    const applySong = (id: string, title: string) => {
      setSongId(id)
      setTrack(title)
    }
    const fail = (error: unknown) => setPlayError(errorText(error))
    const rememberStream = (id: string) => {
      streamUrlRef.current = ""
      fetch(`/api/songs/${id}/play`, { signal: controller.signal, cache: "no-store" })
        .then(async response => {
          const bodyText = await response.text()
          if (!response.ok) {
            throw new Error(httpErrorMessage({
              action: `Play song ${id}`,
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              bodyText,
              contentType: response.headers.get("content-type") ?? "",
            }))
          }
          const body = JSON.parse(bodyText) as { url?: string }
          if (!body.url) throw new Error(`Play song ${id} returned no audio address.`)
          streamUrlRef.current = body.url
        })
        .catch(error => {
          if (error instanceof Error && error.name === "AbortError") return
          fail(error)
        })
    }

    if (/^\d+$/.test(requestedSongId)) {
      rememberStream(requestedSongId)
      fetch(`/api/songs/${requestedSongId}`, { signal: controller.signal, cache: "no-store" })
        .then(async response => {
          const bodyText = await response.text()
          if (!response.ok) {
            throw new Error(httpErrorMessage({
              action: `Song ${requestedSongId}`,
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              bodyText,
              contentType: response.headers.get("content-type") ?? "",
            }))
          }
          const body = JSON.parse(bodyText) as { song?: { title?: string; author?: string } }
          const title = body.song?.title?.trim() || "Song"
          const author = body.song?.author?.trim()
          applySong(requestedSongId, author ? `${title} — ${author}` : title)
        })
        .catch(error => {
          if (error instanceof Error && error.name === "AbortError") return
          fail(error)
        })
      return () => controller.abort()
    }

    const parameters = new URLSearchParams({ limit: "1" })
    if (tags) parameters.set("tags", tags)
    fetch(`/api/recommendations?${parameters.toString()}`, { signal: controller.signal })
      .then(async response => {
        const bodyText = await response.text()
        if (!response.ok) {
          throw new Error(httpErrorMessage({
            action: "Music recommendation",
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            bodyText,
            contentType: response.headers.get("content-type") ?? "",
          }))
        }
        const body = JSON.parse(bodyText) as { items?: { id: string; title: string; author: string }[] }
        const item = body.items?.[0]
        if (!item) {
          setTrack("Add songId to the iframe address")
          return
        }
        applySong(String(item.id), item.author ? `${item.title} — ${item.author}` : item.title)
        rememberStream(String(item.id))
      })
      .catch(error => {
        if (error instanceof Error && error.name === "AbortError") return
        fail(error)
      })
    return () => controller.abort()
  }, [requestedSongId, tags])

  const togglePlay = () => {
    if (!/^\d+$/.test(songId)) return
    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio
    audio.onended = () => setIsPlaying(false)
    if (audio.src && !audio.paused) {
      audio.pause()
      setIsPlaying(false)
      return
    }
    const streamUrl = streamUrlRef.current
    if (!streamUrl) {
      setPlayError(`Play song ${songId} has no audio address yet.`)
      return
    }
    if (!audio.src) audio.src = streamUrl
    setPlayError("")
    setIsPlaying(true)
    void audio.play().catch(error => {
      setIsPlaying(false)
      setPlayError(errorText(error))
    })
  }

  if (hidden) return null

  return (
    <div className="flex h-full items-end justify-end overflow-hidden bg-transparent p-2">
      <div
        className={leaving ? "animate-slide-out-right" : "animate-slide-in-right"}
        onAnimationEnd={() => {
          if (leaving) hideRecommendation()
        }}>
        <MusicRecommendation
          track={track}
          isPlaying={isPlaying}
          onTogglePlay={() => void togglePlay()}
          onNeverShowAgainChange={isChecked => {
            if (!isChecked) return
            setLeaving(true)
            window.setTimeout(() => hideRecommendation(), 500)
          }}
        />
        {playError && <p className="mt-2 max-w-sm text-xs text-white">{playError}</p>}
      </div>
    </div>
  )
}
