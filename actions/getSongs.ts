import { createServerComponentClient } from "@/libs/supabaseServer"
import { Song } from "@/types"

const getSongs = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  const { data, error } = await supabase.from("songs").select("*").order("created_at", { ascending: false })

  if (error) {
    console.log(17, "getSongs error - ", error.message)
  }

  return (data as any) || []
}

export default getSongs
