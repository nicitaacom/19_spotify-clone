import Link from "next/link"

import PlaylistVisibilityBadge from "@/components/PlaylistVisibilityBadge"
import CoverImage from "@/components/CoverImage"
import { PlaylistSummary } from "@/types"
import { getSupabasePublicUrl } from "@/libs/helpers"
import { formatPlaylistPrice } from "@/libs/commerceRules"

interface PlaylistCardProps {
  playlist: PlaylistSummary
  showVisibility?: boolean
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({ playlist, showVisibility = false }) => {
  const coverUrl = getSupabasePublicUrl("images", playlist.cover_image_path)
  const authorName = playlist.author.full_name || playlist.author.username

  return (
    <Link
      href={`/playlists/${playlist.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/5 bg-elevated/40 transition duration-200 hover:border-neon/20 hover:bg-elevated focus-visible:outline-neon">
      <div className="relative aspect-square w-full overflow-hidden">
        <CoverImage
          className="object-cover transition duration-300 group-hover:scale-105"
          fill
          sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 50vw"
          src={coverUrl}
          alt={playlist.title}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-transparent" />
        {showVisibility && (
          <div className="absolute left-2 top-2">
            <PlaylistVisibilityBadge visibility={playlist.visibility} />
          </div>
        )}
      </div>
      <div className="space-y-1 px-2.5 py-2">
        <p className="truncate text-xs font-semibold text-white">{playlist.title}</p>
        <p className="truncate text-[11px] text-neutral-400">
          {authorName} · {playlist.song_count} songs
        </p>
        <p className="text-[11px] font-medium text-neon">
          {playlist.commerce?.ready === false
            ? "Access coming soon"
            : playlist.commerce?.purchased
            ? "✓ Purchased"
            : playlist.commerce?.sales_enabled
            ? `${formatPlaylistPrice(playlist.commerce.price_cents)} once`
            : playlist.commerce?.paid_song_count
            ? "Contains paid songs"
            : "Free to listen"}
        </p>
      </div>
    </Link>
  )
}

export default PlaylistCard
