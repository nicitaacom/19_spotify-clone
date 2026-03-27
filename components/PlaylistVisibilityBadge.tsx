import { PlaylistVisibility } from "@/types"

interface PlaylistVisibilityBadgeProps {
  visibility: PlaylistVisibility
}

const visibilityClasses: Record<PlaylistVisibility, string> = {
  public: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
  unlisted: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  private: "bg-neutral-500/15 text-neutral-200 border-neutral-400/30",
}

const PlaylistVisibilityBadge: React.FC<PlaylistVisibilityBadgeProps> = ({ visibility }) => {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${visibilityClasses[visibility]}`}>
      {visibility}
    </span>
  )
}

export default PlaylistVisibilityBadge
