import Header from "@/components/Header"
import { getPublicPlaylists, getUserPlaylists } from "@/actions/playlists"

import PlaylistsBrowser from "./components/PlaylistsBrowser"
import PlaylistsPageActions from "./components/PlaylistsPageActions"

export const revalidate = 0

export default async function PlaylistsPage() {
  const [publicPlaylists, userPlaylists] = await Promise.all([getPublicPlaylists(), getUserPlaylists()])

  return (
    <div className="bg-surface rounded-lg w-full h-full overflow-x-hidden">
      <Header className="from-[#0f1f14] via-[#0b0f0c]">
        <div className="flex flex-col gap-y-6">
          <div className="flex flex-col gap-y-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-white">Playlists</h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-200">
                Browse public playlists. When your own list is a different size, switch between Public playlists and My playlists.
              </p>
            </div>
            <div className="w-full max-w-[220px]">
              <PlaylistsPageActions />
            </div>
          </div>
        </div>
      </Header>

      <div className="mb-7 px-6 pb-6 pt-4">
        <PlaylistsBrowser publicPlaylists={publicPlaylists} userPlaylists={userPlaylists} />
      </div>
    </div>
  )
}
