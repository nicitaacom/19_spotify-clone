"use client"

import Pusher from "pusher-js"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"

import { useUser } from "@/hooks/useUser"
import useExclusivePlaybackPreference, {
  EXCLUSIVE_PLAYBACK_STORAGE_KEY,
} from "@/hooks/useExclusivePlaybackPreference"

const PUSHER_CLUSTER = "eu"
const PLAYBACK_STARTED_EVENT = "playback-started"

interface PlaybackStartedEvent {
  tabId?: unknown
  startedAt?: unknown
}

interface PlaybackSyncContextValue {
  enabled: boolean
  claimPlayback: () => void
  registerStopHandler: (handler: () => void) => () => void
}

const PlaybackSyncContext = createContext<PlaybackSyncContextValue | undefined>(undefined)

const getPlaybackChannelName = (userId: string) => `private-playback-${userId}`

const createTabId = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const PlaybackSyncProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUser()
  const hasHydrated = useExclusivePlaybackPreference(state => state.hasHydrated)
  const enabledForUser = useExclusivePlaybackPreference(state =>
    user ? (state.enabledByUserId[user.id] ?? false) : false,
  )
  const enabled = hasHydrated && enabledForUser

  const pusherRef = useRef<Pusher | null>(null)
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)
  const tabIdRef = useRef<string | null>(null)
  const lastLocalClaimAtRef = useRef(0)
  const lastRemoteClaimRef = useRef("")
  const stopHandlersRef = useRef(new Set<() => void>())

  const registerStopHandler = useCallback((handler: () => void) => {
    stopHandlersRef.current.add(handler)
    return () => stopHandlersRef.current.delete(handler)
  }, [])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === EXCLUSIVE_PLAYBACK_STORAGE_KEY) {
        void useExclusivePlaybackPreference.persist.rehydrate()
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [])

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY
    if (!enabled || !user || !key) return

    tabIdRef.current ??= createTabId()
    const handlePlaybackStarted = (event: PlaybackStartedEvent) => {
      if (typeof event.tabId !== "string" || typeof event.startedAt !== "number") return
      if (event.tabId === tabIdRef.current) return

      const claimKey = `${event.tabId}:${event.startedAt}`
      if (claimKey === lastRemoteClaimRef.current) return
      lastRemoteClaimRef.current = claimKey

      if (event.startedAt < lastLocalClaimAtRef.current) return
      if (
        event.startedAt === lastLocalClaimAtRef.current &&
        event.tabId <= (tabIdRef.current ?? "")
      ) {
        return
      }

      Array.from(stopHandlersRef.current).forEach(handler => {
        try {
          handler()
        } catch (error) {
          console.error("[pusher] could not stop a playback source", error)
        }
      })
    }

    if ("BroadcastChannel" in window) {
      const broadcastChannel = new BroadcastChannel(`exclusive-playback-${user.id}`)
      broadcastChannel.onmessage = message => handlePlaybackStarted(message.data as PlaybackStartedEvent)
      broadcastChannelRef.current = broadcastChannel
    }

    const pusher = new Pusher(key, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
    })
    pusherRef.current = pusher

    const channelName = getPlaybackChannelName(user.id)
    const channel = pusher.subscribe(channelName)

    channel.bind(PLAYBACK_STARTED_EVENT, handlePlaybackStarted)
    channel.bind("pusher:subscription_error", (error: unknown) => {
      console.error("[pusher] playback channel subscription failed", error)
    })

    return () => {
      channel.unbind(PLAYBACK_STARTED_EVENT, handlePlaybackStarted)
      pusher.unsubscribe(channelName)
      pusher.disconnect()
      if (pusherRef.current === pusher) pusherRef.current = null
      broadcastChannelRef.current?.close()
      broadcastChannelRef.current = null
    }
  }, [enabled, user])

  const claimPlayback = useCallback(() => {
    if (!enabled || !user) return

    const tabId = tabIdRef.current ?? createTabId()
    tabIdRef.current = tabId

    const startedAt = Date.now()
    lastLocalClaimAtRef.current = startedAt
    const socketId = pusherRef.current?.connection.socket_id
    broadcastChannelRef.current?.postMessage({ tabId, startedAt })

    void fetch("/api/pusher/playback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ tabId, socketId, startedAt }),
    })
      .then(response => {
        if (!response.ok) throw new Error(`Playback sync failed with status ${response.status}`)
      })
      .catch(error => {
        console.error("[pusher] could not publish playback state", error)
      })
  }, [enabled, user])

  const value = useMemo(
    () => ({ enabled, claimPlayback, registerStopHandler }),
    [claimPlayback, enabled, registerStopHandler],
  )

  return <PlaybackSyncContext.Provider value={value}>{children}</PlaybackSyncContext.Provider>
}

export const useExclusivePlaybackSource = ({
  isPlaying,
  onStop,
}: {
  isPlaying: boolean
  onStop: () => void
}) => {
  const context = useContext(PlaybackSyncContext)
  if (!context) {
    throw new Error("useExclusivePlaybackSource must be used within PlaybackSyncProvider")
  }

  const { enabled, claimPlayback, registerStopHandler } = context
  const onStopRef = useRef(onStop)
  const wasPlayingRef = useRef(false)

  useEffect(() => {
    onStopRef.current = onStop
  }, [onStop])

  useEffect(
    () => registerStopHandler(() => onStopRef.current()),
    [registerStopHandler],
  )

  useEffect(() => {
    if (!enabled) {
      wasPlayingRef.current = false
      return
    }

    if (isPlaying && !wasPlayingRef.current) claimPlayback()
    wasPlayingRef.current = isPlaying
  }, [claimPlayback, enabled, isPlaying])
}
