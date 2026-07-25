import { NextResponse } from "next/server"

import { requireUser } from "@/app/api/backup/requireUser"
import { getPlaybackChannelName, getPusherServer } from "@/libs/pusherServer"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const formData = await request.formData()
  const socketId = formData.get("socket_id")
  const channelName = formData.get("channel_name")
  const allowedChannel = getPlaybackChannelName(auth.userId)

  if (typeof socketId !== "string" || typeof channelName !== "string") {
    return NextResponse.json({ error: "Missing Pusher authorization fields" }, { status: 400 })
  }

  if (channelName !== allowedChannel) {
    return NextResponse.json({ error: "Forbidden channel" }, { status: 403 })
  }

  try {
    const response = getPusherServer().authorizeChannel(socketId, channelName)
    return NextResponse.json(response)
  } catch (error) {
    console.error("[pusher] channel authorization failed", error)
    return NextResponse.json({ error: "Playback synchronization is unavailable" }, { status: 503 })
  }
}
