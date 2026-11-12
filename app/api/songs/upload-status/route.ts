import { NextResponse } from "next/server"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { errorText } from "@/libs/errorText"
import { selectDBLatestSongUpload } from "@/libs/songUploadRow"

import { requireUser } from "../../backup/requireUser"

// AddASongModal asks this every 5 s while "Storing the song…" shows. The POST response sometimes never arrived after
// the song was stored - the button stayed disabled at 100%, then "Send it again" stored the same song a 2nd time.
// The song counts as stored once its 19_song_access row exists - the last row POST /api/songs inserts.
export async function GET(request: Request) {
  try {
    const auth = await requireUser()
    if (auth instanceof NextResponse) return auth

    const params = new URL(request.url).searchParams
    const title = params.get("title")?.trim() ?? ""
    const author = params.get("author")?.trim() ?? ""
    const size = Number(params.get("size"))
    const playlistId = params.get("playlistId") ?? ""
    const sinceMs = Number(params.get("since"))
    if (!title || !author || !playlistId || !(size > 0) || !Number.isFinite(sinceMs)) {
      return NextResponse.json({ error: "Missing title, author, size, playlistId or since." }, { status: 400 })
    }

    const latest = await selectDBLatestSongUpload(auth.userId, title, author, size)
    const createdMs = latest?.createdAt ? Date.parse(latest.createdAt) : Number.NaN
    // a row from an earlier upload of the same file is not this one - 1 minute of slack for the server clock
    if (!latest || !(createdMs >= sinceMs - 60_000)) return NextResponse.json({ id: null })

    const { data: access, error } = await supabaseAdmin
      .from("19_song_access")
      .select("song_id")
      .eq("song_id", latest.id)
      .eq("playlist_id", playlistId)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ id: access ? latest.id : null }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return NextResponse.json({ error: errorText(error) }, { status: 500 })
  }
}
