import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TMP_BUCKET = "backups-tmp"

// POST /api/backup/import-finalize  { uploadId, chunkPaths }
//
// Called once, after the browser has uploaded every chunk from import-init. Downloads each chunk
// (server-to-Supabase, never through the request body) and concatenates them in order into a
// single reassembled archive object, then removes the now-redundant chunk objects. Reassembly is
// bounded, one-shot work (total archive size is capped client-side, and this is buffer
// concatenation, not per-unit-unbounded work), so it does not need the resumable cursor that
// import-process uses for table/storage work.
//
// Response: { path }
export async function POST(req: Request) {
  const { uploadId, chunkPaths } = await req.json().catch(() => ({}))
  if (!uploadId || typeof uploadId !== "string" || !Array.isArray(chunkPaths) || chunkPaths.length === 0) {
    return NextResponse.json({ error: "Missing uploadId or chunkPaths" }, { status: 400 })
  }

  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  // Only allow reassembling paths under the requesting user's own prefix (see import-init).
  if (chunkPaths.some((chunkPath: unknown) => typeof chunkPath !== "string" || !chunkPath.startsWith(`${userId}/`))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const buffers: Buffer[] = []
  for (const chunkPath of chunkPaths) {
    const { data, error } = await supabaseAdmin.storage.from(TMP_BUCKET).download(chunkPath)
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? `Failed to download chunk ${chunkPath}` }, { status: 400 })
    }
    buffers.push(Buffer.from(await data.arrayBuffer()))
  }

  const reassembled = Buffer.concat(buffers)
  const path = `${userId}/${uploadId}/reassembled.tar.gz`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(TMP_BUCKET)
    .upload(path, reassembled, { contentType: "application/gzip", upsert: true })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  supabaseAdmin.storage.from(TMP_BUCKET).remove(chunkPaths).catch(() => {})

  return NextResponse.json({ path })
}
