import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"

export const dynamic = "force-dynamic"

const TMP_BUCKET = "backups-tmp"
// Supabase's project-wide "Global file size limit" is hard-fixed at 50MB on the Free plan and
// cannot be raised from code (see dev_readme-backup.md). The archive is uploaded in chunks to stay
// under that ceiling, so the bucket limit only needs to cover one chunk, not the whole archive.
const TMP_BUCKET_SIZE_LIMIT = "45mb"
// Matches MAX_TOTAL_SIZE_BYTES / CHUNK_SIZE_BYTES in app/features/backup/BackupSDK.ts — kept in sync manually.
const MAX_CHUNK_COUNT = 50

// POST /api/backup/import-init  { chunkCount }
//
// Issues one short-lived signed upload URL per chunk so the browser can PUT each chunk of the
// .tar.gz archive directly to Supabase Storage — bypassing the Vercel function's request body size
// cap (~4.5MB) entirely, since the archive bytes never pass through this route. The archive is
// split into chunks client-side to stay under Supabase's 50MB global upload limit; see
// dev_readme-backup.md for why neither export nor import may route file bytes through the Vercel
// function body, and why import additionally chunks uploads.
//
// Response: { uploadId, chunkPaths, signedUrls }
export async function POST(req: Request) {
  const { chunkCount } = await req.json().catch(() => ({}))
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNK_COUNT) {
    return NextResponse.json({ error: `chunkCount must be an integer between 1 and ${MAX_CHUNK_COUNT}` }, { status: 400 })
  }

  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  // Service role bypasses RLS, so no bucket policies needed; this bucket is private (not in
  // remotePatterns, never read via public URL). createBucket is idempotent (ignores "already
  // exists"), but it won't retroactively raise the limit on a bucket that already exists without
  // one — updateBucket does, so call both to cover "never created" and "created before this fix".
  await supabaseAdmin.storage.createBucket(TMP_BUCKET, { public: false, fileSizeLimit: TMP_BUCKET_SIZE_LIMIT })
  await supabaseAdmin.storage.updateBucket(TMP_BUCKET, { public: false, fileSizeLimit: TMP_BUCKET_SIZE_LIMIT })

  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const chunkPaths = Array.from({ length: chunkCount }, (_, index) => `${userId}/${uploadId}/chunk-${index}.bin`)

  const signedUrls: string[] = []
  for (const chunkPath of chunkPaths) {
    const { data, error } = await supabaseAdmin.storage.from(TMP_BUCKET).createSignedUploadUrl(chunkPath)
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to create upload URL" }, { status: 500 })
    }
    signedUrls.push(data.signedUrl)
  }

  return NextResponse.json({ uploadId, chunkPaths, signedUrls })
}
