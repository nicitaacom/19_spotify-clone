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

function dismissRecommendation() {
  hiddenInMemory = true
  hiddenListeners.forEach(listener => listener())
}

export default function EmbedClient() {
  const searchParams = useSearchParams()
  const requestedSongId = searchParams.get("songId")?.trim() ?? ""
  const tags = searchParams.get("tags")?.trim() ?? ""
  const hidden = useSyncExternalStore(subscribeHidden, readHidden, () => false)
  const [songId, setSongId] = useState(requestedSongId)
  const [track, setTrack] = useState(requestedSongId ? "Song" : "Music recommendation")
  const [trackHref, setTrackHref] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [playError, setPlayError] = useState("")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const streamUrlRef = useRef("")
  const missingRef = useRef(false)
  const persistCloseRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    missingRef.current = false
    const applySong = (id: string, title: string, href = "") => {
      setSongId(id)
      setTrack(title)
      setTrackHref(href)
    }
    const markMissing = () => {
      missingRef.current = true
      setTrack("Song not found")
      setTrackHref("")
      setPlayError("")
    }
    const fail = (error: unknown) => {
      if (missingRef.current) return
      setPlayError(errorText(error))
    }
    const rememberStream = (id: string) => {
      streamUrlRef.current = ""
      fetch(`/api/songs/${id}/play`, { signal: controller.signal, cache: "no-store" })
        .then(async response => {
          const bodyText = await response.text()
          if (!response.ok) {
            if (response.status === 404 || response.status === 403) {
              markMissing()
              return
            }
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
            if (response.status === 404 || response.status === 403) {
              markMissing()
              return
            }
            throw new Error(httpErrorMessage({
              action: `Song ${requestedSongId}`,
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              bodyText,
              contentType: response.headers.get("content-type") ?? "",
            }))
          }
          const body = JSON.parse(bodyText) as { song?: { title?: string; author?: string; href?: string } }
          const title = body.song?.title?.trim() || "Song"
          const author = body.song?.author?.trim()
          applySong(requestedSongId, author ? `${title} — ${author}` : title, body.song?.href ?? "")
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
        const body = JSON.parse(bodyText) as { items?: { id: string; title: string; author: string; href?: string }[] }
        const item = body.items?.[0]
        if (!item) {
          setTrack("Add songId to the iframe address")
          setTrackHref("")
          return
        }
        let href = ""
        if (item.href) {
          const url = new URL(item.href, window.location.origin)
          url.searchParams.set("songId", String(item.id))
          href = `${url.pathname}${url.search}`
        }
        applySong(String(item.id), item.author ? `${item.title} — ${item.author}` : item.title, href)
        rememberStream(String(item.id))
      })
      .catch(error => {
        if (error instanceof Error && error.name === "AbortError") return
        fail(error)
      })
    return () => controller.abort()
  }, [requestedSongId, tags])

  const togglePlay = () => {
    if (missingRef.current) return
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

  const handleClose = () => {
    if (audioRef.current) audioRef.current.pause()
    setIsPlaying(false)
    persistCloseRef.current = false
    setLeaving(true)
    window.setTimeout(() => dismissRecommendation(), 500)
  }

  if (hidden) return null

  return (
    <div className="flex h-full items-end justify-end overflow-hidden bg-transparent p-2">
      <div
        className={leaving ? "animate-slide-out-right" : "animate-slide-in-right"}
        onAnimationEnd={() => {
          if (!leaving) return
          if (persistCloseRef.current) hideRecommendation()
          else dismissRecommendation()
        }}>
        <MusicRecommendation
          track={track}
          trackHref={trackHref}
          isPlaying={isPlaying}
          onTogglePlay={() => void togglePlay()}
          onClose={handleClose}
          onNeverShowAgainChange={isChecked => {
            if (!isChecked) return
            persistCloseRef.current = true
            setLeaving(true)
            window.setTimeout(() => hideRecommendation(), 500)
          }}
        />
        {playError && <p className="mt-2 max-w-sm text-xs text-white">{playError}</p>}
      </div>
    </div>
  )
}
