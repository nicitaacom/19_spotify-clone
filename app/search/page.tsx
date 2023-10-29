import getSongsByTitle from "@/actions/getSongsByTitle"
import Header from "@/components/Header"
import SearchInput from "@/components/SearchInput"
import SearchContent from "./components/SearchContent"

interface SearchProps {
  searchParams:{
    title:string
  }
}


export default async function Search ({searchParams}:SearchProps) {

  const songs = await getSongsByTitle(searchParams.title)

return (
    <div className="bg-neutral-900 rounded-lg w-full h-full overflow-hidden overflow-y-auto">
      <Header className="from-bg-neutral-900">
        <div className="mb-2 flex flex-col gap-y-6">
          <h1 className="text-white text-3xl font-semibold">
            Search
          </h1>
          <SearchInput/>
        </div>
      </Header>
      <SearchContent songs={songs}/>
    </div>
)
}