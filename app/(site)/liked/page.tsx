import getLikedSongs from "@/actions/getLikedSongs"
import Header from "@/components/Header"
import Image from "next/image"
import LikedContent from "./components/LikedContent"

export const revalidate = 0

export default async function Liked() {
  const songs = await getLikedSongs()

  return (
    <div className="h-full w-full overflow-x-hidden rounded-lg bg-surface">
      <Header className="bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent">
        <div className="mt-10">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-end">
            <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-indigo-500 via-sky-400 to-emerald-300 shadow-[0_24px_80px_-36px_rgba(56,189,248,0.55)] lg:h-44 lg:w-44">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_45%)]" />
              <Image className="object-cover p-7" fill sizes="176px" src="/images/liked.png" alt="Liked songs playlist" />
            </div>
            <div className="flex flex-col gap-y-3 text-center md:text-left">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Playlist</p>
              <h1 className="text-4xl font-bold text-white sm:text-5xl lg:text-7xl">Liked songs</h1>
              <p className="max-w-2xl text-sm text-neutral-200 sm:text-base">
                Your personal stash of favorites, refreshed with cleaner actions and a more polished collection view.
              </p>
              <p className="text-sm text-neutral-300">
                {songs.length} saved {songs.length === 1 ? "track" : "tracks"}
              </p>
            </div>
          </div>
        </div>
      </Header>
      <LikedContent songs={songs} />
    </div>
  )
}
