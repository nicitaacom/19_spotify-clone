import { NextResponse } from "next/server"
import uniqid from "uniqid"

import { commerceAdmin as admin } from "@/libs/commerceAdmin"
import { isId, requireCommerceUser } from "@/libs/commerceHttp"
import { isOwnerId } from "@/libs/getOwnerIds"
import { getSafeStoragePath } from "@/libs/helpers"
import { imageFileError } from "@/libs/imageFiles"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommerceUser()
  if (user instanceof NextResponse) return user
  try {
    const { id } = await params
    if (!isId(id)) return NextResponse.json({ error: "Invalid playlist." }, { status: 400 })
    if (!user.email) return NextResponse.json({ error: "Missing account email" }, { status: 400 })

    const { data: playlist, error: playlistError } = await admin
      .from("19_playlists")
      .select("user_id, title, cover_image_path")
      .eq("id", id)
      .maybeSingle()
    if (playlistError) return NextResponse.json({ error: playlistError.message }, { status: 400 })
    if (!playlist || (playlist.user_id !== user.id && !(isOwnerId(user.id) && isOwnerId(playlist.user_id)))) {
      return NextResponse.json({ error: "Playlist not found." }, { status: 404 })
    }

    const formData = await request.formData()
    const image = formData.get("image")
    if (!(image instanceof File)) return NextResponse.json({ error: "Missing: image" }, { status: 400 })
    const rejectedImage = imageFileError(image)
    if (rejectedImage) return NextResponse.json({ error: rejectedImage }, { status: 400 })

    const imagePath = getSafeStoragePath({
      prefix: "cover",
      value: playlist.title,
      uniqueId: uniqid(),
      fileName: image.name,
      ownerEmail: user.email,
    })
    const { error: uploadError } = await admin.storage.from("images").upload(imagePath, image, {
      cacheControl: "3600",
      upsert: false,
      contentType: image.type.toLowerCase(),
    })
    if (uploadError) return NextResponse.json({ error: `Failed cover upload: ${uploadError.message}` }, { status: 400 })

    const previousCover = playlist.cover_image_path
    const { error: updateError } = await admin.from("19_playlists").update({ cover_image_path: imagePath }).eq("id", id)
    if (updateError) {
      await admin.storage.from("images").remove([imagePath])
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
    if (previousCover && previousCover !== imagePath) await admin.storage.from("images").remove([previousCover])
    return NextResponse.json({ cover_image_path: imagePath })
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error"
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `${name}: ${message}` }, { status: 500 })
  }
}
