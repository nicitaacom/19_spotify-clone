import { Song } from "@/types"

import { createServerComponentClient } from "@/libs/supabaseServer"

const getLikedSongs = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data } = await supabase
    .from("19_liked_songs")
    .select("*, songs(*)")
    .eq("user_id", session?.user?.id)
    .order("created_at", { ascending: false })

  if (!data) return []

  return data.map(item => ({
    ...item.songs,
  }))
}

export default getLikedSongs
