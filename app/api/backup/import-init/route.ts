import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { requireUser } from "../requireUser"

export const dynamic = "force-dynamic"

const TMP_BUCKET = "backups-tmp"

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

  // Idempotent — ignores "already exists". Service role bypasses RLS, so no bucket policies needed;
  // this bucket is private (not in remotePatterns, never read via public URL).
  await supabaseAdmin.storage.createBucket(TMP_BUCKET, { public: false })

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`

  const { data, error } = await supabaseAdmin.storage.from(TMP_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create upload URL" }, { status: 500 })
  }

  return NextResponse.json({ path, signedUrl: data.signedUrl, token: data.token })
}
