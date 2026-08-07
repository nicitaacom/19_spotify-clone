import supabaseAuthClient from "@/libs/supabaseAuthClient"
import { createServerComponentClient } from "@/libs/supabaseServer"
import { Song } from "@/types"

const getSongsByUserId = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  const { data: sessionData, error: sessionError } = await supabaseAuthClient.auth.getSession()

  if (sessionError) {
    console.log(14, "session error in getSongsByUserId - ", sessionError.message)
    return []
  }
  if (!sessionData.session) {
    // it means user not authenticated
    return []
  }

  const { data, error } = await supabase
    .from("19_songs")
    .select("*")
    .eq("user_id", sessionData.session?.user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.log(25, "select songs eq user_id error in getSongsByUserId - ", error.message)
  }

  return (data as Song[]) || []
}

export default getSongsByUserId
