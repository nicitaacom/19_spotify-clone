import { supabaseAdmin } from "@/libs/supabaseAdmin"

// The newest song row this user created with this exact title, author and byte size. POST /api/songs reads it to
// reject a repeated create, GET /api/songs/upload-status reads it to report an upload that already finished.
export async function selectDBLatestSongUpload(userId: string, title: string, author: string, size: number) {
  const { data, error } = await supabaseAdmin
    .from("19_songs")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("title", title)
    .eq("author", author)
    .eq("size_bytes", size)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.id ? { id: Number(data.id), createdAt: data.created_at as string | null } : null
}
