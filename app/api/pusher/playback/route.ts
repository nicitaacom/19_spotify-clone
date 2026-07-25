import { NextResponse } from "next/server"

import { requireUser } from "@/app/api/backup/requireUser"
import {
  getPlaybackChannelName,
  getPusherServer,
  PLAYBACK_STARTED_EVENT,
} from "@/libs/pusherServer"

interface PlaybackStartedRequest {
  tabId?: unknown
  socketId?: unknown
  startedAt?: unknown
}

const isSocketId = (value: unknown): value is string =>
  typeof value === "string" && /^\d+\.\d+$/.test(value) && value.length <= 64

export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const body = (await request.json().catch(() => ({}))) as PlaybackStartedRequest
  const { tabId, socketId, startedAt } = body

  if (typeof tabId !== "string" || tabId.length === 0 || tabId.length > 128) {
    return NextResponse.json({ error: "Invalid tab ID" }, { status: 400 })
  }

  if (typeof startedAt !== "number" || !Number.isFinite(startedAt) || startedAt <= 0) {
    return NextResponse.json({ error: "Invalid playback timestamp" }, { status: 400 })
  }

  if (socketId !== undefined && !isSocketId(socketId)) {
    return NextResponse.json({ error: "Invalid Pusher socket ID" }, { status: 400 })
  }

  try {
    await getPusherServer().trigger(
      getPlaybackChannelName(auth.userId),
      PLAYBACK_STARTED_EVENT,
      { tabId, startedAt },
      socketId ? { socket_id: socketId } : undefined,
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[pusher] playback event failed", error)
    return NextResponse.json({ error: "Could not synchronize playback" }, { status: 502 })
  }
}
