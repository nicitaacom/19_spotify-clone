import { NextResponse } from "next/server"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireCommerceUser } from "@/libs/commerceHttp"
import { isOwnerId } from "@/libs/getOwnerIds"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  if (!isOwnerId(user.id)) return NextResponse.json({ error: "Only the site admin can review suggestions." }, { status: 403 })
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Suggestion not found." }, { status: 404 })
    const { action } = await request.json()
    if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 })

    const { data: suggestion, error } = await supabaseAdmin
      .from("19_song_suggestions")
      .select("id, song_id, title, author, tags, status")
      .eq("id", Number(id))
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!suggestion || suggestion.status !== "pending") return NextResponse.json({ error: "Suggestion not found." }, { status: 404 })

    if (action === "approve") {
      const songPatch: { title?: string; author?: string; tags?: string[] } = {}
      if (suggestion.title) songPatch.title = suggestion.title
      if (suggestion.author) songPatch.author = suggestion.author
      if (suggestion.tags) songPatch.tags = suggestion.tags
      if (Object.keys(songPatch).length) {
        const { error: songError } = await supabaseAdmin.from("19_songs").update(songPatch).eq("id", suggestion.song_id)
        if (songError) return NextResponse.json({ error: songError.message }, { status: 400 })
      }
    }
    const { error: reviewError } = await supabaseAdmin
      .from("19_song_suggestions")
      .update({ status: action === "approve" ? "approved" : "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", suggestion.id)
    if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error"
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `${name}: ${message}` }, { status: 500 })
  }
}
