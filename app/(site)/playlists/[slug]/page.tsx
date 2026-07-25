import Image from "next/image"
import { notFound } from "next/navigation"

import { getPlaylistBySlug } from "@/actions/playlists"
import Header from "@/components/Header"
import PlaylistVisibilityBadge from "@/components/PlaylistVisibilityBadge"
import { getSupabasePublicUrl } from "@/libs/helpers"
import { createServerComponentClient } from "@/libs/supabaseServer"

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
    data: { session },
  } = await supabase.auth.getSession()

  const canManage = session?.user?.id === playlist.user_id
  const coverUrl = getSupabasePublicUrl("images", playlist.cover_image_path) ?? "/images/liked.png"
  const authorName = playlist.author.full_name || playlist.author.username
  const description = playlist.description?.trim() || DEFAULT_PLAYLIST_DESCRIPTION

  return (
    <div className="bg-surface rounded-lg w-full h-full overflow-x-hidden">
      <Header className="from-[#0f1f14] via-[#0b0f0c]">
        <div className="mt-10">
          <div className="flex flex-col items-center gap-x-5 gap-y-4 md:flex-row md:items-end">
            <div className="relative h-32 w-32 overflow-hidden rounded-md lg:h-44 lg:w-44">
              <Image className="object-cover" fill sizes="176px" quality={100} unoptimized src={coverUrl} alt={playlist.title} />
            </div>
            <div className="flex flex-col gap-y-3 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-200">Playlist</p>
                <PlaylistVisibilityBadge visibility={playlist.visibility} />
              </div>
              <h1 className="text-4xl font-bold text-white sm:text-5xl lg:text-7xl">{playlist.title}</h1>
              <p className="max-w-3xl text-sm leading-6 text-neutral-300 sm:text-base">{description}</p>
              <p className="text-sm text-neutral-200">
                By {authorName} · {playlist.songs.length} songs
              </p>
            </div>
          </div>
        </div>
      </Header>
      <PlaylistDetailContent canManage={canManage} playlist={playlist} />
    </div>
  )
}
