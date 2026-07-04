"use client"

import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { HiHome } from "react-icons/hi"
import { BiSearch } from "react-icons/bi"
import { TbPlaylist } from "react-icons/tb"
import { MdMusicNote } from "react-icons/md"
import { twMerge } from "tailwind-merge"

import Box from "./Box"
import SidebarItem from "./SidebarItem"
import Library from "./Library"
import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import useOwnerStore from "@/hooks/useOwnerStore"

interface SidebarProps {
  children: React.ReactNode
  songs: Song[]
  isOwner: boolean
}

const Sidebar: React.FC<SidebarProps> = ({ children, songs, isOwner }) => {
  const pathname = usePathname()
  const player = usePlayer()

  useOwnerStore.getState().setIsOwner(isOwner)

  const routes = useMemo(
    () => [
      {
        icon: HiHome,
        label: "Home",
        active: pathname === "/",
        href: "/",
      },
      {
        icon: BiSearch,
        label: "Search",
        active: pathname.startsWith("/search"),
        href: "/search",
      },
      {
        icon: TbPlaylist,
        label: "Playlists",
        active: pathname.startsWith("/playlists"),
        href: "/playlists",
      },
      {
        icon: MdMusicNote,
        label: "My Songs",
        active: pathname.startsWith("/my-songs"),
        href: "/my-songs",
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
    [pathname],
  )

  return (
    <div className={twMerge(`flex h-full`, player.activeId && "h-[calc(100%-80px)]")}>
      <div className="hidden md:flex flex-col gap-y-2 bg-dark-base border-r border-white/5 h-full w-[300px] p-2">
        <Box>
          <div className="flex flex-col gap-y-4 px-5 py-4">
            {routes.map(item => (
              <SidebarItem key={item.label} {...item} />
            ))}
          </div>
        </Box>
        <Box className="hide-scrollbar h-full">
          <Library songs={songs} />
        </Box>
      </div>
      <main className="relative z-10 h-full flex-1 overflow-y-auto overflow-x-hidden scrollbar rounded-lg py-2 pr-2">{children}</main>
    </div>
  )
}

export default Sidebar
