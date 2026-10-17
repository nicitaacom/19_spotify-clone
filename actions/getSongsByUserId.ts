import { createServerComponentClient } from "@/libs/supabaseServer"
import { Song } from "@/types"

const getSongsByUserId = async (): Promise<Song[]> => {
  const supabase = await createServerComponentClient()

  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  const userId = session?.user?.id

  if (sessionError && sessionError.message !== "Auth session missing!") {
    console.log(14, "session error in getSongsByUserId - ", sessionError.message)
  }
  if (sessionError || !userId) return []

  const { data, error } = await supabase
    .from("19_songs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) {
    console.log(25, "select songs eq user_id error in getSongsByUserId - ", error.message)
  }

  return (data as Song[]) || []
}

export default getSongsByUserId
