import getSongs from "@/actions/getSongs"

import PageContent from "./PageContent"

export const revalidate = 0

const AllSongsSection = async () => {
  const songs = await getSongs()

  return (
    <div className="mt-2 pb-7 px-6">
      <div className="flex justify-between items-center">
        <h1 className="text-white text-2xl font-semibold">Top Songs</h1>
      </div>
      <PageContent songs={songs} />
    </div>
  )
}

export default AllSongsSection
