import Image from "next/image"
import Link from "next/link"

import PlaylistVisibilityBadge from "@/components/PlaylistVisibilityBadge"
import { PlaylistSummary } from "@/types"
import { getSupabasePublicUrl } from "@/libs/helpers"

interface PlaylistCardProps {
  playlist: PlaylistSummary
  showVisibility?: boolean
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({ playlist, showVisibility = false }) => {
  const coverUrl = getSupabasePublicUrl("images", playlist.cover_image_path) ?? "/images/liked.png"
  const authorName = playlist.author.full_name || playlist.author.username

  return (
    <Link
      href={`/playlists/${playlist.slug}`}
      className="group flex h-full flex-col gap-y-3 rounded-lg bg-neutral-900/70 p-4 transition hover:bg-neutral-800/80">
      <div className="relative aspect-square w-full overflow-hidden rounded-md">
        <Image className="object-cover" fill sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 100vw" src={coverUrl} alt={playlist.title} />
      </div>
      <div className="flex flex-col gap-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-white">{playlist.title}</p>
            <p className="truncate text-sm text-neutral-400">By {authorName}</p>
          </div>
          {showVisibility ? <PlaylistVisibilityBadge visibility={playlist.visibility} /> : null}
        </div>
        <p className="text-sm text-neutral-400">{playlist.song_count} songs</p>
        {playlist.description ? <p className="line-clamp-2 text-sm text-neutral-300">{playlist.description}</p> : null}
      </div>
    </Link>
  )
}

export default PlaylistCard
