import Header from "../../components/Header"
import ListItem from "../../components/ListItem"
import RankedPlaylistsSection from "./components/RankedPlaylistsSection"
import SupportLink from "@/components/SupportLink"

export const revalidate = 0

export default async function Home() {
  return (
    <div className="text-neutral-400 w-full min-h-full bg-surface pb-28">
      <Header className="from-[#163323] via-[#122019] to-surface">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-white text-3xl font-semibold">Welcome back</h1>
          <SupportLink />
        </div>
        <div className="mt-3 max-w-xs text-white">
          <ListItem image="/images/liked.png" name="Liked Songs" href="/liked" />
        </div>
      </Header>
      <RankedPlaylistsSection />
    </div>
  )
}
