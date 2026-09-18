import { NextResponse } from "next/server"
import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { requireCommerceUser, commerceError } from "@/libs/commerceHttp"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommerceUser(true)
  if (user instanceof NextResponse) return user
  try {
    const { id } = await params
    const { title, author } = await request.json()
    if (!/^\d+$/.test(id) || typeof title !== "string" || !title.trim() || typeof author !== "string" || !author.trim())
      throw new Error("Title and artist are required.")
    const { data, error } = await admin
      .from("19_songs")
      .update({ title: title.trim(), author: author.trim() })
      .eq("id", Number(id))
      .select("id")
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: "Song not found." }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    return commerceError(error)
  }
}
