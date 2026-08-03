import { useEffect, useMemo, useState } from "react"
import { toast } from "react-hot-toast"

import { Song } from "@/types"
import supabaseClient from "@/libs/supabaseClient"

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
      const { data, error } = await supabaseClient.from("19_songs").select("*").eq("id", Number(id)).maybeSingle()

      if (error) {
        setIsLoading(false)
        return toast.error(error.message)
      }

      setSong(data as unknown as Song)
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
