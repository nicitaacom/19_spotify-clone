import getRankedPlaylistsAction from "@/actions/getRankedPlaylistsAction"

import RankedPlaylistsContent from "./RankedPlaylistsContent"

export const revalidate = 0

const RankedPlaylistsSection = async () => {
  const playlists = await getRankedPlaylistsAction()

  return (
    <div className="mt-2 pb-7 px-6">
      <div className="flex justify-between items-center">
        <h1 className="text-white text-2xl font-semibold">Top Playlists</h1>
      </div>
      <RankedPlaylistsContent playlists={playlists} />
    </div>
  )
}

export default RankedPlaylistsSection
