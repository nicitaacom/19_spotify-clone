import { createServerComponentClient } from "@/libs/supabaseServer"
import { Song } from "@/types"

const getSongs = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  const { data, error } = await supabase
    .from("songs")
    .select(`
      *,
      liked_songs(count)
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.log(17, "getSongs error - ", error.message)
  }

  const songsWithLikes = (data as any[])?.map(song => ({
    ...song,
    likes_count: song.liked_songs?.[0]?.count || 0,
  })) || []

  songsWithLikes.sort((a, b) => b.likes_count - a.likes_count)

  return songsWithLikes
}

export default getSongs
