"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

import usePlayer from "@/hooks/usePlayer"
import { readStickyQueryFlag } from "@/app/utils/stickyQueryFlag"

// The only pages allowed to hold this site in an iframe with ?playOnPhone=1, read its "now playing"
// messages and send it play / pause / localSound / volume (outreach-tool's music panel).
const PLAY_ON_PHONE_PARENT_ORIGINS = ["https://outreach-tool.com", "https://www.outreach-tool.com", "http://localhost:3000"]

type NowPlayingSong = { id: string; title: string; author: string }

type ParentMessage = { type?: string; on?: boolean; percent?: number }

interface UsePlayOnPhoneArgs {
  song: NowPlayingSong
  songUrl: string
  expiresAt?: number
  getPositionSec: () => number
  getDurationSec: () => number
}

const emptySubscribe = () => () => {}

// sticky: the param is on the iframe's first URL only, the mode must survive every navigation inside it.
// Exported for IframeFlagsTracker, which reads it on the first page: this hook lives in the player, which
// mounts only once a song plays - by then the query is already gone from the URL.
export const readIsPlayOnPhone = () =>
  readStickyQueryFlag("playOnPhone", search => new URLSearchParams(search).get("playOnPhone") === "1")

// The iframe's referrer is the page that holds it - only a listed page gets messages, never "*". After a
// reload inside the iframe the referrer is this site itself, so the frame's ancestor origins are the fallback.
const readParentOrigin = () => {
  const holderOrigins = [document.referrer, ...Array.from(window.location.ancestorOrigins ?? [])]
  return (
    PLAY_ON_PHONE_PARENT_ORIGINS.find(origin =>
      holderOrigins.some(holderOrigin => holderOrigin === origin || holderOrigin.startsWith(`${origin}/`)),
    ) ?? null
  )
}

/**
 * ?playOnPhone=1 - the page holding this site in an iframe plays the song on a phone instead:
 * - this site plays muted (volumeForHowl = 0) unless the page sends { type: "localSound", on: true }
 * - every play / pause / seek / song change posts { type: "nowPlaying", ... } to that page
 * - the page can send { type: "play" | "pause" }, { type: "localSound", on }, { type: "volume", percent }
 */
const usePlayOnPhone = ({ song, songUrl, expiresAt, getPositionSec, getDurationSec }: UsePlayOnPhoneArgs) => {
  const isPlayOnPhone = useSyncExternalStore(emptySubscribe, readIsPlayOnPhone, () => false)
  const [isLocalSoundOn, setIsLocalSoundOn] = useState(false)
  const [localVolumePercent, setLocalVolumePercent] = useState(100)
  const parentOriginRef = useRef<string | null>(null)
  // read through refs so postNowPlaying never lists a function in its deps
  const getPositionSecRef = useRef(getPositionSec)
  const getDurationSecRef = useRef(getDurationSec)
  useEffect(() => {
    getPositionSecRef.current = getPositionSec
    getDurationSecRef.current = getDurationSec
  })

  useEffect(() => {
    parentOriginRef.current = isPlayOnPhone ? readParentOrigin() : null
  }, [isPlayOnPhone])

  const postNowPlaying = useCallback(
    (isPlaying: boolean) => {
      const parentOrigin = parentOriginRef.current
      if (!isPlayOnPhone || !parentOrigin || window.parent === window) return
      window.parent.postMessage(
        {
          type: "nowPlaying",
          songId: String(song.id),
          songUrl,
          expiresAt: expiresAt ?? null,
          title: song.title,
          author: song.author,
          positionSec: getPositionSecRef.current(),
          durationSec: getDurationSecRef.current(),
          isPlaying,
        },
        parentOrigin,
      )
    },
    [isPlayOnPhone, song.id, song.title, song.author, songUrl, expiresAt],
  )

  useEffect(() => {
    if (!isPlayOnPhone) return
    const onParentMessage = (event: MessageEvent) => {
      if (!PLAY_ON_PHONE_PARENT_ORIGINS.includes(event.origin)) return
      const data = event.data as ParentMessage | null
      if (!data || typeof data !== "object") return
      const { requestPlaybackCommand } = usePlayer.getState()
      if (data.type === "play" || data.type === "pause") requestPlaybackCommand(data.type)
      else if (data.type === "localSound") setIsLocalSoundOn(Boolean(data.on))
      else if (data.type === "volume" && typeof data.percent === "number") setLocalVolumePercent(Math.max(0, Math.min(100, data.percent)))
    }
    window.addEventListener("message", onParentMessage)
    return () => window.removeEventListener("message", onParentMessage)
  }, [isPlayOnPhone])

  // the volume the Howl gets: muted while the phone is the speaker, the page's percent when the laptop plays too
  const volumeForHowl = (volume: number) => (isPlayOnPhone ? (isLocalSoundOn ? (volume * localVolumePercent) / 100 : 0) : volume)

  return { isPlayOnPhone, postNowPlaying, volumeForHowl }
}

export default usePlayOnPhone
