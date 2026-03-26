import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies, headers } from "next/headers"

import { Song } from "@/types"

import getSongs from "./getSongs"

const getSongsByTitle = async (title: string): Promise<Song[]> => {
  const cookieStore = await cookies()
  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  })

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
