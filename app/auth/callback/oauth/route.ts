import { NextResponse } from "next/server"
import { errorText } from "@/libs/errorText"

import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { upsertSpotifyUserFn } from "../functions/upsertSpotifyUserFn"

const createRedirectUrl = (origin: string, authError?: string) => {
  const redirectUrl = new URL(origin)

  if (authError) {
    redirectUrl.searchParams.set("auth_error", authError)
  }

  return redirectUrl
}

// The origin the browser sees, not the one the server listens on. Inside the VPS image (Coolify + Traefik,
// Next standalone) request.url is built from the container's own HOSTNAME + PORT - https://0.0.0.0:3019 -
// so a redirect made from url.origin sent the browser to 0.0.0.0 after every login (2026-11-02). The proxy
// forwards the public host + scheme in x-forwarded-host / x-forwarded-proto; Next fills x-forwarded-host
// from the Host header itself when no proxy set it, so `next dev` on any port lands here as well.
const publicOrigin = (request: Request, url: URL) => {
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const host = forwardedHost?.split(",")[0].trim()
  if (!host) return url.origin
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? url.protocol.replace(":", "")
  return `${protocol}://${host}`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = publicOrigin(request, url)
  const code = url.searchParams.get("code")
  const provider = url.searchParams.get("provider") ?? "github"
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error")

  if (providerError) {
    return NextResponse.redirect(createRedirectUrl(origin, providerError))
  }

  if (!code) {
    return NextResponse.redirect(createRedirectUrl(origin, "Missing OAuth code."))
  }

  try {
    const supabase = await createRouteHandlerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(createRedirectUrl(origin, errorText(error)))
    }

    if (!user) {
      return NextResponse.redirect(createRedirectUrl(origin, "OAuth code exchange returned no user."))
    }

    const upsertUserResp = await upsertSpotifyUserFn(user, provider)

    if (typeof upsertUserResp === "string") {
      return NextResponse.redirect(createRedirectUrl(origin, upsertUserResp))
    }

    return NextResponse.redirect(createRedirectUrl(origin))
  } catch (error) {
    return NextResponse.redirect(
      createRedirectUrl(origin, errorText(error)),
    )
  }
}
