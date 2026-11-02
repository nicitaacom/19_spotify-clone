import { NextResponse } from "next/server"

import { requireUser } from "../../backup/requireUser"
import { isOwnerId } from "@/libs/getOwnerIds"
import { errorText } from "@/libs/errorText"
import { normalizeSongTags } from "@/libs/songTags"
import { bilingualSongTags } from "@/libs/openaiTagTranslation"

export async function POST(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  if (!isOwnerId(auth.userId)) {
    return NextResponse.json({ error: "Only the site administrator can translate song tags." }, { status: 403 })
  }

  let tags: string[]
  try {
    const body = await request.json()
    tags = normalizeSongTags(body?.tags)
  } catch (error) {
    return NextResponse.json({ error: errorText(error) }, { status: 400 })
  }

  try {
    return NextResponse.json({ tags: await bilingualSongTags(tags) })
  } catch (error) {
    return NextResponse.json({ error: errorText(error) }, { status: 502 })
  }
}
