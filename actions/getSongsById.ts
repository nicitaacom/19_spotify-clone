import { Song } from "@/types"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

const getSongsById = async (id: string): Promise<Song[]> => {
  const supabase = createServerComponentClient({
    cookies: cookies,
  })
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    console.log(sessionError.message)
    return []
  }

  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .order("created_at", { ascending: false })

  if (error) {
    console.log(error.message)
  }

  return (data as any) || []
}

export default getSongsById
