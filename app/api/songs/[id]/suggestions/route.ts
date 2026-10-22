import { NextResponse } from "next/server"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireCommerceUser } from "@/libs/commerceHttp"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSongAccess } from "@/libs/playlistAccess"
import { suggestionChanges } from "@/libs/songSuggestions"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    const access = (await getSongAccess([id], { id: user.id, isOwner: isOwnerId(user.id) })).get(id)
    if (!access?.can_play) return NextResponse.json({ error: "Purchase a playlist containing this song to suggest an edit." }, { status: 403 })

    const { data: song, error: songError } = await supabaseAdmin.from("19_songs").select("id, title, author, tags").eq("id", Number(id)).maybeSingle()
    if (songError) return NextResponse.json({ error: songError.message }, { status: 400 })
    if (!song) return NextResponse.json({ error: "Song not found." }, { status: 404 })

    const changes = suggestionChanges(song, await request.json())
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("19_song_suggestions")
      .select("id")
      .eq("song_id", song.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle()
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })

    if (!existing) {
      const { count, error: countError } = await supabaseAdmin
        .from("19_song_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending")
      if (countError) return NextResponse.json({ error: countError.message }, { status: 400 })
      if ((count ?? 0) >= 20) return NextResponse.json({ error: "You already have 20 suggestions waiting." }, { status: 400 })
      const { error } = await supabaseAdmin.from("19_song_suggestions").insert({ song_id: song.id, user_id: user.id, ...changes })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const { error } = await supabaseAdmin.from("19_song_suggestions").update(changes).eq("id", existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error"
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `${name}: ${message}` }, { status: 400 })
  }
}
