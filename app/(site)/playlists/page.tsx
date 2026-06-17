import Header from "@/components/Header"
import { getPublicPlaylists, getUserPlaylists } from "@/actions/playlists"

import PlaylistCard from "./components/PlaylistCard"
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
                Browse public playlists, open unlisted playlists by link, and manage your own public, unlisted, and private playlists.
              </p>
            </div>
            <div className="w-full max-w-[220px]">
              <PlaylistsPageActions />
            </div>
          </div>
        </div>
      </Header>

      <div className="mb-7 flex flex-col gap-y-10 px-6 pb-6 pt-4">
        <section className="flex flex-col gap-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Public playlists</h2>
            <p className="mt-1 text-sm text-neutral-400">Visible to everyone and listed on this page.</p>
          </div>
          {publicPlaylists.length === 0 ? (
            <p className="text-sm text-neutral-400">No public playlists yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {publicPlaylists.map(playlist => (
                <PlaylistCard key={playlist.id} playlist={playlist} />
              ))}
            </div>
          )}
        </section>

        {userPlaylists.length > 0 ? (
          <section className="flex flex-col gap-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Your playlists</h2>
              <p className="mt-1 text-sm text-neutral-400">Includes your public, unlisted, and private playlists.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {userPlaylists.map(playlist => (
                <PlaylistCard key={playlist.id} playlist={playlist} showVisibility />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
