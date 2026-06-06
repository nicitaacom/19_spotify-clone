import { Song } from "@/types"

import { createServerComponentClient } from "@/libs/supabaseServer"

const getLikedSongs = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user?.id) {
    return []
  }

  const { data } = await supabase
    .from("19_liked_songs")
    .select("*, song:19_songs(*)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })

  if (!data) return []

  return data.map(item => ({
    id: String(item.song.id),
    user_id: item.song.user_id ?? "",
    author: item.song.author ?? "",
    title: item.song.title ?? "",
    song_path: item.song.song_path ?? "",
    image_path: item.song.image_path ?? "",
  }))
}

export default getLikedSongs
