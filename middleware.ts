import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"
import { NextRequest, NextResponse } from "next/server"

import { supabaseClientOptions } from "@/libs/supabaseFetch"

export async function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-pathname", req.nextUrl.pathname)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  const supabase = createMiddlewareClient(
    { req, res },
    { supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, options: supabaseClientOptions },
  )
  await supabase.auth.getSession()
  // /embed: anyone may frame it. Every other page: this site itself + outreach-tool's music panel
  // (it holds the full site in an iframe with ?playOnPhone=1 - hooks/usePlayOnPhone.ts)
  res.headers.set(
    "Content-Security-Policy",
    req.nextUrl.pathname === "/embed"
      ? "frame-ancestors * file:"
      : "frame-ancestors 'self' https://outreach-tool.com https://www.outreach-tool.com http://localhost:3000",
  )
  return res
}
