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
  if (req.nextUrl.pathname === "/embed") res.headers.set("Content-Security-Policy", "frame-ancestors * file:")
  return res
}
