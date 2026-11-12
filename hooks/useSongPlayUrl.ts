import { useCallback, useEffect, useState } from "react"
import { Song } from "@/types"
import { useUser } from "@/hooks/useUser"
import { errorText, httpErrorMessage } from "@/libs/errorText"

type AudioUrlState = { key: string; url: string; error?: string; unlockSlug?: string; expiresAt?: number }

// /play signs a new storage address on each request. The preload got one address, the player then asked again and got
// another, so the preloaded bytes never served the player and the song downloaded twice. One address per song is
// reused while it has REUSE_MIN_LEFT_MS left - a retry (attempt > 0) always asks /play for a fresh one.
const REUSE_MIN_LEFT_MS = 10 * 60 * 1000
const songUrlByUserSong = new Map<string, { url: string; expiresAt: number }>()

const useSongPlayUrl = (song?: Song) => {
  const { user, isLoading } = useUser()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<AudioUrlState>({ key: "", url: "" })
  const id = song?.id
  const key = `${user?.id ?? "guest"}:${id ?? ""}:${attempt}`
  const retry = useCallback(() => setAttempt(n => n + 1), [])

  useEffect(() => {
    if (!id || isLoading) return
    const userSongKey = `${user?.id ?? "guest"}:${id}`
    const reusable = attempt === 0 ? songUrlByUserSong.get(userSongKey) : undefined
    const controller = new AbortController()
    if (reusable && reusable.expiresAt - Date.now() > REUSE_MIN_LEFT_MS) {
      // set after the effect, like the /play answer below - the expiry check needs Date.now(), so it has no place in render
      void Promise.resolve().then(() => {
        if (controller.signal.aborted) return
        console.log("[player] song url reused", id)
        setState({ key, url: reusable.url, expiresAt: reusable.expiresAt })
      })
      return () => controller.abort()
    }
    const startedAt = performance.now()
    fetch(`/api/songs/${id}/play`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const bodyText = await response.text()
        if (!response.ok) {
          let unlockSlug: string | undefined
          try {
            const body = JSON.parse(bodyText) as { unlock_slug?: string }
            unlockSlug = body.unlock_slug
          } catch {
            unlockSlug = undefined
          }
          setState({
            key,
            url: "",
            error: httpErrorMessage({
              action: `Audio URL for song ${id}`,
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              bodyText,
              contentType: response.headers.get("content-type") ?? "",
            }),
            unlockSlug,
          })
          return
        }
        const body = JSON.parse(bodyText) as { url: string; expires_at?: number }
        console.log(`[player] song url for ${id} in ${Math.round(performance.now() - startedAt)}ms`)
        if (body.expires_at) songUrlByUserSong.set(userSongKey, { url: body.url, expiresAt: body.expires_at })
        setState({ key, url: body.url, expiresAt: body.expires_at })
      })
      .catch(error => {
        if (error instanceof Error && error.name === "AbortError") return
        setState({ key, url: "", error: errorText(error) })
      })
    return () => controller.abort()
  }, [id, key, isLoading, attempt, user?.id])

  return { ...(state.key === key && !isLoading ? state : { key, url: "" }), retry }
}

export default useSongPlayUrl
