import "server-only"
import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { errorText } from "@/libs/errorText"
import { isOwnerId } from "@/libs/getOwnerIds"

export async function requireCommerceUser(ownerOnly = false) {
  const client = await createRouteHandlerClient()
  const {
    data: { user },
  } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  if (ownerOnly && !isOwnerId(user.id))
    return NextResponse.json({ error: "Only the site owner can do this." }, { status: 403 })
  return user
}

export const commerceError = (error: unknown, status = 400) =>
  NextResponse.json(
    { error: errorText(error) },
    { status }
  )

export const isId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
