import getSongsByUserId from "@/actions/getSongsByUserId"
import Header from "@/components/Header"
import { getIsOwner } from "@/libs/getIsOwner"
import MySongsContent from "./components/MySongsContent"

export const revalidate = 0

export default async function MySongs() {
  const songs = await getSongsByUserId()
  const isOwner = await getIsOwner()

  return (
    <div className="h-full w-full overflow-x-hidden rounded-lg bg-surface text-white">
      <Header className="bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent">
        <div className="mt-10">
          <div className="flex flex-col gap-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-100">Library</p>
            <h1 className="text-4xl font-bold text-white sm:text-5xl lg:text-7xl">My Songs</h1>
            <p className="max-w-2xl text-sm text-neutral-400 sm:text-base">
              All songs you have uploaded. Delete any track permanently from here.
            </p>
            <p className="text-sm text-neutral-300">
              {songs.length} uploaded {songs.length === 1 ? "song" : "songs"}
            </p>
          </div>
        </div>
      </Header>
      <MySongsContent songs={songs} isOwner={isOwner} />
    </div>
  )
}
