import { createServerComponentClient } from "@/libs/supabaseServer"
import { Song } from "@/types"

import getSongs from "./getSongs"

const getSongsByTitle = async (title: string): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  if (!title) {
    const allSongs = await getSongs()
    return allSongs
  }

  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .ilike("title", `%${title}%`)
    .order("created_at", { ascending: false })

  if (error) {
    console.log(25, "error - ", error.message)
  }

  return (data as any) || []
}

export default getSongsByTitle
