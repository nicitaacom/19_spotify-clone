import getSongsByTitle from "@/actions/getSongsByTitle"
import Header from "@/components/Header"
import SearchInput from "@/components/SearchInput"
import SearchContent from "./components/SearchContent"

interface SearchProps {
  searchParams: Promise<{
    title?: string
  }>
}

export default async function Search({ searchParams }: SearchProps) {
  const resolvedSearchParams = await searchParams
  const songs = await getSongsByTitle(resolvedSearchParams.title ?? "")

  return (
    <div className="bg-surface rounded-lg w-full h-full overflow-x-hidden">
      <Header className="from-[#0f1f14] via-[#0b0f0c]">
        <div className="mb-2 flex flex-col gap-y-6">
          <h1 className="text-white text-3xl font-semibold">Search</h1>
          <SearchInput />
        </div>
      </Header>
      <SearchContent songs={songs} />
    </div>
  )
}
