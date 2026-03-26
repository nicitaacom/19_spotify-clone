import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

import { Song } from "@/types"

const getSongsByUserId = async (): Promise<Song[]> => {
  const cookieStore = await cookies()
  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  })

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    console.log(14, "session error in getSongsByUserId - ", sessionError.message)
    return []
  }
  if (!sessionData.session) {
    // it means user not authenticated
    return []
  }

  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("user_id", sessionData.session?.user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.log(25, "select songs eq user_id error in getSongsByUserId - ", error.message)
  }

  return (data as any) || []
}

export default getSongsByUserId
