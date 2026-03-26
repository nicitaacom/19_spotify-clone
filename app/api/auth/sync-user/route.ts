import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"

import { Database } from "@/types_db"
import { upsertSpotifyUserFn } from "@/app/auth/callback/functions/upsertSpotifyUserFn"

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore })
    const { provider = "credentials" } = ((await request.json().catch(() => ({}))) as { provider?: string }) ?? {}
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json({ error: error?.message ?? "Unauthorized" }, { status: 401 })
    }

    const upsertUserResp = await upsertSpotifyUserFn(user, provider)

    if (typeof upsertUserResp === "string") {
      return NextResponse.json({ error: upsertUserResp }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync the current user." },
      { status: 500 },
    )
  }
}
