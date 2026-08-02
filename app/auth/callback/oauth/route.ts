import { NextResponse } from "next/server"

import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { upsertSpotifyUserFn } from "../functions/upsertSpotifyUserFn"

const createRedirectUrl = (origin: string, authError?: string) => {
  const redirectUrl = new URL(origin)

  if (authError) {
    redirectUrl.searchParams.set("auth_error", authError)
  }

  return redirectUrl
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const provider = url.searchParams.get("provider") ?? "github"
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error")

  if (providerError) {
    return NextResponse.redirect(createRedirectUrl(url.origin, providerError))
  }

  if (!code) {
    return NextResponse.redirect(createRedirectUrl(url.origin, "Missing OAuth code."))
  }

  try {
    const supabase = await createRouteHandlerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(createRedirectUrl(url.origin, error.message))
    }

    if (!user) {
      return NextResponse.redirect(createRedirectUrl(url.origin, "Unable to load your account."))
    }

    const upsertUserResp = await upsertSpotifyUserFn(user, provider)

    if (typeof upsertUserResp === "string") {
      return NextResponse.redirect(createRedirectUrl(url.origin, upsertUserResp))
    }

    return NextResponse.redirect(createRedirectUrl(url.origin))
  } catch (error) {
    return NextResponse.redirect(
      createRedirectUrl(url.origin, error instanceof Error ? error.message : "OAuth callback failed."),
    )
  }
}
