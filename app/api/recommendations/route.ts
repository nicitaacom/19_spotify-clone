import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { errorText } from "@/libs/errorText"
import { recommendationQuery, type MusicRecommendation } from "@/libs/musicRecommendations"
import { supabaseFetch } from "@/libs/supabaseFetch"
import type { Database } from "@/app/interfaces/types_db"

export async function GET(request: Request) {
  let query
  try { query = recommendationQuery(new URL(request.url).searchParams) }
  catch (error) { return NextResponse.json({ error: errorText(error) }, { status: 400 }) }
  const headers = { "Cache-Control": "public, max-age=60, s-maxage=300" }
  if (!query.tags.length && !query.query) return NextResponse.json({ items: [], relatedTags: [] }, { headers })
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("Public music query is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.")
    }
    // Never inherit request cookies, a service key, or a signed-in listener's purchases.
    const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: supabaseFetch } })
    const { data, error } = query.query
      ? await client.rpc("search_public_music", { p_query: query.query, p_limit: query.limit })
      : await client.rpc("recommend_public_music", { p_tags: query.tags, p_limit: query.limit })
    if (error) throw error
    const items: MusicRecommendation[] = (data ?? []).map(song => ({
      id: String(song.id), title: song.title ?? "Untitled", author: song.author ?? "",
      coverUrl: song.image_path ? client.storage.from("images").getPublicUrl(song.image_path).data.publicUrl : null,
      href: `https://music.jokik.fi/playlists/${encodeURIComponent(song.playlist_slug)}`,
      tags: song.tags, matchedTags: song.matched_tags,
    }))
    return NextResponse.json({ items, relatedTags: Array.from(new Set(items.flatMap(item => item.tags))).slice(0, 24) }, { headers })
  } catch (error) {
    return NextResponse.json({ error: errorText(error) },
      { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
