import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

import { Song } from "@/types"

const getSongs = async (): Promise<Song[]> => {
  const cookieStore = await cookies()
  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  })

  const { data, error } = await supabase.from("songs").select("*").order("created_at", { ascending: false })

  if (error) {
    console.log(17, "getSongs error - ", error.message)
  }

  return (data as any) || []
}

export default getSongs
