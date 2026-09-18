import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/libs/supabaseServer"

export async function requireUser() {
  const supabase = await createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as NextResponse
  }

  return { userId: user.id, email: user.email, supabase }
}
