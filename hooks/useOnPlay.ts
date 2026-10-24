import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { Song } from "@/types"
import { errorText, httpErrorMessage } from "@/libs/errorText"
import usePlayer from "./usePlayer"

let playbackRequest = 0

const useOnPlay = (songs: Song[], onLocked?: (id: string) => boolean | void, playlistId?: string) => {
  const player = usePlayer()
  const router = useRouter()

  return async (id: string) => {
    id = String(id)
    if (player.activeId === id) {
      if (!player.isLoading) player.requestPlaybackCommand(player.isPlaying ? "pause" : "play")
      return
    }
    const request = ++playbackRequest
    try {
      const access: Record<string, Pick<Song, "can_play" | "is_paid" | "unlock_slug">> = {}
      for (let start = 0; start < songs.length; start += 500) {
        const response = await fetch("/api/songs/access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: songs.slice(start, start + 500).map(s => String(s.id)),
            ...(playlistId ? { playlist_id: playlistId } : {}),
          }),
        })
        const bodyText = await response.text()
        if (!response.ok) {
          throw new Error(httpErrorMessage({
            action: "Song access",
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            bodyText,
            contentType: response.headers.get("content-type") ?? "",
          }))
        }
        const body = bodyText ? JSON.parse(bodyText) as { access?: typeof access } : {}
        Object.assign(access, body.access)
      }
      if (request !== playbackRequest) return
      if (!access[id]?.can_play) {
        if (onLocked && onLocked(id) !== false) return
        if (access[id]?.unlock_slug) router.push(`/playlists/${access[id].unlock_slug}#playlist-access`)
        else toast.error("This song is locked. Open its original playlist to check availability.")
        return
      }
      const queue = songs.map(s => ({ ...s, id: String(s.id), ...access[String(s.id)] })).filter(s => s.can_play)
      player.startPlayback(id, queue, playlistId)
    } catch (error) {
      toast.error(errorText(error))
    }
  }
}

export default useOnPlay
