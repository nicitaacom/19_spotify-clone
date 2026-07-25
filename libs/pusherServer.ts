import Pusher from "pusher"

export const PUSHER_CLUSTER = "eu"
export const PLAYBACK_STARTED_EVENT = "playback-started"

export const getPlaybackChannelName = (userId: string) => `private-playback-${userId}`

let pusherServer: Pusher | null = null

export const getPusherServer = () => {
  if (pusherServer) return pusherServer

  const appId = process.env.PUSHER_APP_ID
  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY
  const secret = process.env.PUSHER_SECRET

  if (!appId || !key || !secret) {
    throw new Error("Pusher Channels environment variables are not configured")
  }

  pusherServer = new Pusher({
    appId,
    key,
    secret,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  })

  return pusherServer
}
