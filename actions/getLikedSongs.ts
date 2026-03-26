import { Song } from "@/types"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

const getLikedSongs = async (): Promise<Song[]> => {
  const cookieStore = await cookies()
  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data } = await supabase
    .from("liked_songs")
    .select("*, songs(*)")
    .eq("user_id", session?.user?.id)
    .order("created_at", { ascending: false })

  if (!data) return []

  return data.map(item => ({
    ...item.songs,
  }))
}

export default getLikedSongs
