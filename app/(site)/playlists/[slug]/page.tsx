import Image from "next/image"
import { notFound } from "next/navigation"

import { getPlaylistBySlug } from "@/actions/playlists"
import Header from "@/components/Header"
import PlaylistVisibilityBadge from "@/components/PlaylistVisibilityBadge"
import { getSupabasePublicUrl } from "@/libs/helpers"
import { createServerComponentClient } from "@/libs/supabaseServer"
import { formatPlaylistPrice } from "@/libs/commerceRules"

import PlaylistDetailContent from "../components/PlaylistDetailContent"

export const revalidate = 0

const DEFAULT_PLAYLIST_DESCRIPTION =
  "Even if the original video is deleted from YouTube years later, the music saved in this playlist will stay here."

interface PlaylistDetailPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function PlaylistDetailPage({ params }: PlaylistDetailPageProps) {
  const resolvedParams = await params
  const playlist = await getPlaylistBySlug(resolvedParams.slug)
  const supabase = await createServerComponentClient()

  if (!playlist) {
    notFound()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const canManage = user?.id === playlist.user_id || Boolean(playlist.commerce?.can_manage)
  const coverUrl = getSupabasePublicUrl("images", playlist.cover_image_path) ?? "/images/liked.png"
  const authorName = playlist.author.full_name || playlist.author.username
  const description = playlist.description?.trim() || DEFAULT_PLAYLIST_DESCRIPTION

  return (
    <div className="flex min-h-full w-full flex-col overflow-x-hidden rounded-lg bg-surface">
      <Header className="from-[#183526] via-[#132019] to-surface">
        <div className="mb-1 mt-4">
          <div className="flex items-start gap-4 sm:items-end sm:gap-5">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg shadow-lg sm:h-32 sm:w-32 lg:h-40 lg:w-40">
              <Image
                className="object-cover"
                fill
                sizes="(min-width: 1024px) 160px, (min-width: 640px) 128px, 96px"
                quality={100}
                unoptimized
                src={coverUrl}
                alt={playlist.title}
              />
            </div>
            <div className="min-w-0 flex flex-col gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <PlaylistVisibilityBadge visibility={playlist.visibility} />
              </div>
              <h1 className="break-words text-2xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                {playlist.title}
              </h1>
              <p className="max-w-2xl text-xs leading-5 text-neutral-300 sm:text-sm">{description}</p>
              <p className="text-xs text-neutral-200">
                By {authorName} · {playlist.songs.length} songs
              </p>
              {playlist.commerce?.sales_enabled && (
                <p className="text-xs text-neon">
                  {playlist.commerce.purchased
                    ? "Purchased · Future additions included"
                    : `${formatPlaylistPrice(playlist.commerce.price_cents)} once · Updated monthly`}
                </p>
              )}
            </div>
          </div>
        </div>
      </Header>
      <PlaylistDetailContent canManage={canManage} playlist={playlist} />
    </div>
  )
}
