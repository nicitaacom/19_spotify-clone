"use client"

import { useState } from "react"

import { PlaylistSummary } from "@/types"

import PlaylistCard from "./PlaylistCard"

type PlaylistTab = "public" | "mine"

const PlaylistsBrowser = ({ publicPlaylists, userPlaylists }: {
  publicPlaylists: PlaylistSummary[]
  userPlaylists: PlaylistSummary[]
}) => {
  const countsDiffer = publicPlaylists.length !== userPlaylists.length
  const [tab, setTab] = useState<PlaylistTab>("public")
  const selectedTab = countsDiffer ? tab : "public"
  const playlists = selectedTab === "mine" ? userPlaylists : publicPlaylists

  return (
    <section className="flex flex-col gap-y-4">
      {countsDiffer ? (
        <div className="flex flex-col gap-y-3">
          <div role="tablist" aria-label="Playlist lists" className="flex flex-wrap gap-2">
            <TabButton selected={selectedTab === "public"} count={publicPlaylists.length} onClick={() => setTab("public")}>
              Public playlists
            </TabButton>
            <TabButton selected={selectedTab === "mine"} count={userPlaylists.length} onClick={() => setTab("mine")}>
              My playlists
            </TabButton>
          </div>
          <p className="text-sm text-neutral-400">
            {selectedTab === "mine"
              ? "Includes your public, unlisted, and private playlists."
              : "Visible to everyone and listed on this page."}
          </p>
        </div>
      ) : (
        <div>
          <h2 className="text-2xl font-semibold text-white">Public playlists</h2>
          <p className="mt-1 text-sm text-neutral-400">Visible to everyone and listed on this page.</p>
        </div>
      )}

      {playlists.length === 0 ? (
        <p className="text-sm text-neutral-400">
          {selectedTab === "mine" ? "You have no playlists yet." : "No public playlists yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {playlists.map(playlist => (
            <PlaylistCard key={playlist.id} playlist={playlist} showVisibility={selectedTab === "mine"} />
          ))}
        </div>
      )}
    </section>
  )
}

function TabButton({ selected, count, onClick, children }: {
  selected: boolean
  count: number
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        selected
          ? "border-neon/50 bg-neon/15 text-white"
          : "border-white/10 bg-elevated text-neutral-300 hover:border-white/20 hover:text-white"
      }`}>
      {children}
      <span className="ml-2 text-neutral-400">{count}</span>
    </button>
  )
}

export default PlaylistsBrowser
