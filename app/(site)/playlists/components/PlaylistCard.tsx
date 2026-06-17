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
      className="group flex flex-col overflow-hidden rounded-xl border border-white/5 bg-surface shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition duration-200 hover:border-neon/20 hover:bg-elevated">
      <div className="relative aspect-square w-full overflow-hidden">
        <Image className="object-cover transition duration-300 group-hover:scale-105" fill sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw" src={coverUrl} alt={playlist.title} />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-transparent" />
        {showVisibility && (
          <div className="absolute left-2 top-2">
            <PlaylistVisibilityBadge visibility={playlist.visibility} />
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-xs font-semibold text-white">{playlist.title}</p>
        <p className="truncate text-[11px] text-neutral-500">{authorName} · {playlist.song_count} songs</p>
      </div>
    </Link>
  )
}

export default PlaylistCard
