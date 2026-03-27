import { Song } from "@/types"
import { getSupabasePublicUrl } from "@/libs/helpers"

const useLoadImage = (song: Song) => {
  if (!song) {
    return null
  }

  return getSupabasePublicUrl("images", song.image_path)
}

export default useLoadImage
