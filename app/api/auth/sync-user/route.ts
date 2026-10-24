import { NextResponse } from "next/server"

import { upsertSpotifyUserFn } from "@/app/auth/callback/functions/upsertSpotifyUserFn"
import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { checkAuthRateLimit } from "@/libs/authRateLimit"
import { errorText } from "@/libs/errorText"

export async function POST(request: Request) {
  const rateLimit = checkAuthRateLimit(request, { maxAttempts: 10, windowMs: 60 * 60 * 1000 })
  if (!rateLimit.allowed) {
    const retryAfterSec = Math.ceil(rateLimit.resetInMs / 1000)
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    )
  }

  try {
    const supabase = await createRouteHandlerClient()
    const { provider = "credentials" } = ((await request.json().catch(() => ({}))) as { provider?: string }) ?? {}
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) return NextResponse.json({ error: errorText(error) }, { status: 401 })
    if (!user) return NextResponse.json({ error: "No signed-in user." }, { status: 401 })

    const upsertUserResp = await upsertSpotifyUserFn(user, provider)

    if (typeof upsertUserResp === "string") {
      return NextResponse.json({ error: upsertUserResp }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: errorText(error) },
      { status: 500 },
    )
  }
}
