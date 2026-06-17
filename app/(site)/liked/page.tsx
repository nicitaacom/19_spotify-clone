import getLikedSongs from "@/actions/getLikedSongs"
import Header from "@/components/Header"
import Image from "next/image"
import LikedContent from "./components/LikedContent"

export const revalidate = 0

export default async function Liked() {
  const songs = await getLikedSongs()

  return (
    <div className="h-full w-full overflow-x-hidden rounded-lg bg-surface">
      <Header className="from-[#0f1f14] via-[#0b0f0c]">
        <div className="flex items-center gap-5">
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-indigo-500 via-sky-400 to-emerald-300">
            <Image className="object-cover p-4" fill sizes="80px" src="/images/liked.png" alt="Liked songs" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neon/70">Playlist</p>
            <h1 className="mt-1 text-3xl font-bold text-white">Liked songs</h1>
            <p className="mt-1 text-sm text-neutral-400">{songs.length} saved {songs.length === 1 ? "track" : "tracks"}</p>
          </div>
        </div>
      </Header>
      <LikedContent songs={songs} />
    </div>
  )
}
