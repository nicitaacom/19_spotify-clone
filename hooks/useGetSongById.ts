import { useEffect, useMemo, useState } from "react"
import { toast } from "react-hot-toast"

import { Song } from "@/types"

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
        const body = await response.json()
        if (response.status === 403) {
          setSong(undefined)
          setIsLoading(false)
          return
        }
        if (!response.ok) throw new Error(body.error ?? "Unable to load song.")
        setSong(body.song as Song)
      } catch (error) {
        setIsLoading(false)
        return toast.error(error instanceof Error ? error.message : "Unable to load song.")
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
