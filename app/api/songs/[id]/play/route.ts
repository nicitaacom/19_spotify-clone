import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSongAccess } from "@/libs/playlistAccess"
import { commerceError } from "@/libs/commerceHttp"
import { httpErrorMessage } from "@/libs/errorText"
import { parseAudioByteRange, sliceAudioStream } from "@/libs/audioRange"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    const { data: song, error } = await admin.from("19_songs").select("song_path,size_bytes").eq("id", Number(id)).maybeSingle()
    if (error) throw error
    if (!song) return NextResponse.json({ error: "Song not found." }, { status: 404 })
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
    if (!song.song_path) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    if (!new URL(request.url).searchParams.has("stream")) {
      return NextResponse.json(
        { url: `/api/songs/${id}/play?stream=${crypto.randomUUID()}` },
        { headers: { "Cache-Control": "private, no-store" } }
      )
    }

    const size = Number(song.size_bytes)
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`Audio file size_bytes is ${String(song.size_bytes)}, which is not a positive safe integer.`)
    const rangeHeader = request.headers.get("range")
    const range = rangeHeader ? parseAudioByteRange(rangeHeader, size) : null
    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" },
      })
    }

    const { data, error: signingError } = await admin.storage.from("songs").createSignedUrl(song.song_path, 3600)
    if (signingError || !data) throw signingError
    const upstream = await fetch(data.signedUrl, {
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
      cache: "no-store",
    })
    if (!upstream.ok || !upstream.body) {
      const bodyText = upstream.body ? await upstream.text() : ""
      throw new Error(httpErrorMessage({
        action: `Audio stream for song ${id}`,
        status: upstream.status,
        statusText: upstream.statusText,
        url: upstream.url,
        bodyText,
        contentType: upstream.headers.get("content-type") ?? "",
      }))
    }
    if (upstream.status === 206) {
      const contentRange = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(upstream.headers.get("content-range") ?? "")
      if (!range || !contentRange || Number(contentRange[1]) !== range.start || Number(contentRange[2]) < range.end) {
        await upstream.body.cancel()
        throw new Error("Audio storage returned an unexpected range.")
      }
    }

    const length = range ? range.end - range.start + 1 : size
    const body = range ? sliceAudioStream(upstream.body, upstream.status === 206 ? 0 : range.start, length) : upstream.body
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Type": song.song_path.toLowerCase().endsWith(".m4a") ? "audio/mp4" : "audio/mpeg",
        "Content-Length": String(length),
        ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` } : {}),
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return commerceError(error, 503)
  }
}
