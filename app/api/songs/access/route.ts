import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@/libs/supabaseServer"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSongAccess } from "@/libs/playlistAccess"
import { commerceError } from "@/libs/commerceHttp"

export async function POST(request: Request) {
  try {
    const { ids } = await request.json()
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => typeof id !== "string" || !/^\d+$/.test(id)))
      throw new Error("Invalid song IDs.")
    const client = await createRouteHandlerClient()
    const {
      data: { user },
    } = await client.auth.getUser()
    const access = await getSongAccess(ids, { id: user?.id ?? null, isOwner: isOwnerId(user?.id) })
    return NextResponse.json(
      { access: Object.fromEntries(access) },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return commerceError(error, 503)
  }
}
