import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/libs/supabaseServer"

export async function requireUser() {
  const supabase = await createRouteHandlerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as NextResponse
  }

  return { userId: session.user.id, email: session.user.email, supabase }
}
