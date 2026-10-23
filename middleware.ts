import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"
import { NextRequest, NextResponse } from "next/server"

import { supabaseClientOptions } from "@/libs/supabaseFetch"

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient(
    { req, res },
    { supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, options: supabaseClientOptions },
  )
  await supabase.auth.getSession()
  return res
}
