import { createServerComponentClient } from "@/libs/supabaseServer"
import { Song } from "@/types"

const getSongs = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  const { data, error } = await supabase
    .from("19_songs")
    .select(
      `
      *,
      19_liked_songs(count)
    `,
    )
    .order("created_at", { ascending: false })

  if (error) {
    console.log(17, "getSongs error - ", error.message)
  }

  const songsWithLikes =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any[])?.map(song => ({
      ...song,
      likes_count: song["19_liked_songs"]?.[0]?.count || 0,
    })) || []

  songsWithLikes.sort((a, b) => b.likes_count - a.likes_count)

  return songsWithLikes
}

export default getSongs
