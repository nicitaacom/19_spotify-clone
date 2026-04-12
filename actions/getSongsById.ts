import { Song } from "@/types"

import { createServerComponentClient } from "@/libs/supabaseServer"

const getSongsById = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    console.log(12, "session error in getSongsById - ", sessionError.message)
    return []
  }

  const { data, error } = await supabase
    .from("19_songs")
    .select("*")
    .eq("user_id", sessionData.session?.user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.log(23, "getSongsById error - ", error.message)
  }

  return (data as any) || []
}

export default getSongsById
