import { useCallback, useEffect, useState } from "react"
import { Song } from "@/types"
import { useUser } from "@/hooks/useUser"

type AudioUrlState = { key: string; url: string; error?: string; unlockSlug?: string; expiresAt?: number }

const useLoadSongUrl = (song?: Song) => {
  const { user, isLoading } = useUser()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<AudioUrlState>({ key: "", url: "" })
  const id = song?.id
  const key = `${user?.id ?? "guest"}:${id ?? ""}:${attempt}`
  const retry = useCallback(() => setAttempt(n => n + 1), [])

  useEffect(() => {
    if (!id || isLoading) return
    const controller = new AbortController()
    fetch(`/api/songs/${id}/play`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) {
          setState({ key, url: "", error: body.error ?? "Unable to load audio.", unlockSlug: body.unlock_slug })
        } else setState({ key, url: body.url, expiresAt: body.expires_at })
      })
      .catch(error => {
        if (error.name !== "AbortError")
          setState({ key, url: "", error: "Audio is unavailable. Check your connection and retry." })
      })
    return () => controller.abort()
  }, [id, key, isLoading])

  return { ...(state.key === key && !isLoading ? state : { key, url: "" }), retry }
}

export default useLoadSongUrl
