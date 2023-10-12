import { Song } from "@/types"
import { useSupabaseClient } from "@supabase/auth-helpers-react"

const useLoadSongUrl = (song: Song) => {
  const supabaseClient = useSupabaseClient()

  if (!song) {
    return null
  }

  const { data } = supabaseClient.storage.from("songs").getPublicUrl(song.song_path)
}

export default useLoadSongUrl
