import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"

export const dynamic = "force-dynamic"

const TMP_BUCKET = "backups-tmp"
// Supabase's own default (when no fileSizeLimit is set on a bucket) falls back to the project-wide
// Storage limit, which is 50MB on most plans — too small for a real music-library backup. Set an
// explicit, generous per-bucket limit so this never silently caps out again.
const TMP_BUCKET_SIZE_LIMIT = "1gb"

// POST /api/backup/import-init
//
// Issues a short-lived signed upload URL so the browser can PUT the .tar.gz archive directly to
// Supabase Storage — bypassing the Vercel function's request body size cap (~4.5MB) entirely,
// since the archive bytes never pass through this route. See dev_readme-backup.md for why this
// exists: neither export nor import may route file bytes through the Vercel function body.
//
// Response: { path, signedUrl, token }
export async function POST() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { userId } = auth

  // Service role bypasses RLS, so no bucket policies needed; this bucket is private (not in
  // remotePatterns, never read via public URL). createBucket is idempotent (ignores "already
  // exists"), but it won't retroactively raise the limit on a bucket that already exists without
  // one — updateBucket does, so call both to cover "never created" and "created before this fix".
  await supabaseAdmin.storage.createBucket(TMP_BUCKET, { public: false, fileSizeLimit: TMP_BUCKET_SIZE_LIMIT })
  await supabaseAdmin.storage.updateBucket(TMP_BUCKET, { public: false, fileSizeLimit: TMP_BUCKET_SIZE_LIMIT })

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`

  const { data, error } = await supabaseAdmin.storage.from(TMP_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create upload URL" }, { status: 500 })
  }

  return NextResponse.json({ path, signedUrl: data.signedUrl, token: data.token })
}
