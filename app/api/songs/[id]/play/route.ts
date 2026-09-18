import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSongAccess } from "@/libs/playlistAccess"
import { commerceError } from "@/libs/commerceHttp"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    const client = await createRouteHandlerClient()
    const {
      data: { user },
    } = await client.auth.getUser()
    const access = (await getSongAccess([id], { id: user?.id ?? null, isOwner: isOwnerId(user?.id) })).get(id)
    if (!access?.can_play)
      return NextResponse.json(
        { error: "Purchase a playlist containing this song to listen.", unlock_slug: access?.unlock_slug },
        { status: 403 }
      )
    const { data: song, error } = await admin.from("19_songs").select("song_path").eq("id", Number(id)).maybeSingle()
    if (error) throw error
    if (!song?.song_path) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    const { data, error: signingError } = await admin.storage.from("songs").createSignedUrl(song.song_path, 3600)
    if (signingError || !data) throw signingError
    return NextResponse.json(
      { url: data.signedUrl, expires_at: Date.now() + 3600_000 },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return commerceError(error, 503)
  }
}
