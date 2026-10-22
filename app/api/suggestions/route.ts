import { NextResponse } from "next/server"

import { requireCommerceUser } from "@/libs/commerceHttp"
import { isOwnerId } from "@/libs/getOwnerIds"
import { listPendingSuggestions } from "@/libs/songSuggestions"

export async function GET() {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  if (!isOwnerId(user.id)) return NextResponse.json({ error: "Only the site admin can review suggestions." }, { status: 403 })
  try {
    return NextResponse.json({ suggestions: await listPendingSuggestions() })
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error"
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `${name}: ${message}` }, { status: 500 })
  }
}
