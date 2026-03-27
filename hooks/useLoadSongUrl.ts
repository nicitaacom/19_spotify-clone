import { Song } from "@/types"
import { getSupabasePublicUrl } from "@/libs/helpers"

const useLoadSongUrl = (song?: Song) => {
  if (!song) {
    return ""
  }

  return getSupabasePublicUrl("songs", song.song_path) ?? ""
}

export default useLoadSongUrl
