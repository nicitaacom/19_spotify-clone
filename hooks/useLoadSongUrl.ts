import { useCallback, useEffect, useState } from "react"
import { Song } from "@/types"
import { useUser } from "@/hooks/useUser"
import { errorText, httpErrorMessage } from "@/libs/errorText"

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
        setState({ key, url: body.url, expiresAt: body.expires_at })
      })
      .catch(error => {
        if (error instanceof Error && error.name === "AbortError") return
        setState({ key, url: "", error: errorText(error) })
      })
    return () => controller.abort()
  }, [id, key, isLoading])

  return { ...(state.key === key && !isLoading ? state : { key, url: "" }), retry }
}

export default useLoadSongUrl
