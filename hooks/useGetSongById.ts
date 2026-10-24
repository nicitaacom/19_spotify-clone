import { useEffect, useMemo, useState } from "react"
import { toast } from "react-hot-toast"

import { Song } from "@/types"
import { errorText, httpErrorMessage } from "@/libs/errorText"

const useSongById = (id?: string) => {
  const [isLoading, setIsLoading] = useState(false)
  const [song, setSong] = useState<Song | undefined>(undefined)

  const [prevId, setPrevId] = useState(id)
  if (id !== prevId) {
    setPrevId(id)
    if (id) {
      setIsLoading(true)
    } else {
      setSong(undefined)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!id) return

    const fetchSong = async () => {
      try {
        const response = await fetch(`/api/songs/${id}`, { cache: "no-store" })
        const bodyText = await response.text()
        if (response.status === 403) {
          setSong(undefined)
          setIsLoading(false)
          return
        }
        if (!response.ok) {
          throw new Error(httpErrorMessage({
            action: `Song ${id}`,
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            bodyText,
            contentType: response.headers.get("content-type") ?? "",
          }))
        }
        const body = JSON.parse(bodyText) as { song: Song }
        setSong(body.song)
      } catch (error) {
        setIsLoading(false)
        return toast.error(errorText(error))
      }
      setIsLoading(false)
    }

    fetchSong()
  }, [id])

  return useMemo(
    () => ({
      isLoading,
      song,
    }),
    [isLoading, song],
  )
}

export default useSongById
