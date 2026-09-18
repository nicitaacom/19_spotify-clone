import { useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { Song } from "@/types"
import usePlayer from "./usePlayer"

let playbackRequest = 0

const useOnPlay = (songs: Song[], onLocked?: () => void) => {
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
          body: JSON.stringify({ ids: songs.slice(start, start + 500).map(s => String(s.id)) }),
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
        Object.assign(access, body.access)
      }
      if (request !== playbackRequest) return
      if (!access[id]?.can_play) {
        if (onLocked) return onLocked()
        if (access[id]?.unlock_slug) router.push(`/playlists/${access[id].unlock_slug}#playlist-access`)
        else toast.error("This song is locked. Open its original playlist to check availability.")
        return
      }
      const queue = songs.map(s => ({ ...s, id: String(s.id), ...access[String(s.id)] })).filter(s => s.can_play)
      player.setSongs(queue)
      player.setIds(queue.map(s => s.id))
      player.setIsPlaying(false)
      player.setId(id)
      player.setActiveSong(queue.find(s => s.id === id))
      player.setIsLoading(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check song access. Please try again.")
    }
  }
}

export default useOnPlay
