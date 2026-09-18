import getRankedPlaylistsAction from "@/actions/getRankedPlaylistsAction"
import { getPurchasedPlaylists } from "@/actions/playlists"

import RankedPlaylistsContent from "./RankedPlaylistsContent"

export const revalidate = 0

const RankedPlaylistsSection = async () => {
  const [ranked, purchased] = await Promise.all([getRankedPlaylistsAction(), getPurchasedPlaylists()])
  const playlists = [...ranked, ...purchased.filter(p => !ranked.some(r => r.id === p.id))]

  return (
    <div className="mt-2 pb-7 px-4 sm:px-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-white text-2xl font-semibold tracking-tight">Top Playlists</h2>
        </div>
      </div>
      <RankedPlaylistsContent playlists={playlists} />
    </div>
  )
}

export default RankedPlaylistsSection
