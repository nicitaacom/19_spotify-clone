"use client"

import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { HiHome } from "react-icons/hi"
import { BiSearch } from "react-icons/bi"
import { TbPlaylist, TbWaveSine } from "react-icons/tb"
import { MdCompress, MdMusicNote, MdSurroundSound } from "react-icons/md"
import { twMerge } from "tailwind-merge"

import Box from "./Box"
import SidebarItem from "./SidebarItem"
import Library from "./Library"
import { Song } from "@/types"
import usePlayer from "@/hooks/usePlayer"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import { useSyncOwnerStore } from "@/hooks/useSyncOwnerStore"

interface SidebarProps {
  children: React.ReactNode
  songs: Song[]
  isOwner: boolean
}

const Sidebar: React.FC<SidebarProps> = ({ children, songs, isOwner }) => {
  const pathname = usePathname()
  const player = usePlayer()
  // inside another site's iframe (outreach-tool's music panel, 24rem wide) the frame itself is the card:
  // no gap above / below / beside the content, no rounded corner - see TODO 2026-11-02_at_16-45
  const isIframe = useIsIframeAuth()

  useSyncOwnerStore(isOwner)

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
      ...(isOwner
        ? [
            {
              icon: MdMusicNote,
              label: "My Songs",
              active: pathname.startsWith("/my-songs"),
              href: "/my-songs",
            },
          ]
        : []),
      {
        icon: TbWaveSine,
        label: "Slow & Reverb",
        active: pathname.startsWith("/slow-and-reverb"),
        href: "/slow-and-reverb",
      },
      {
        icon: MdSurroundSound,
        label: "8D Generator",
        active: pathname.startsWith("/8d-generator"),
        href: "/8d-generator",
      },
      {
        icon: MdCompress,
        label: "Compress File",
        active: pathname.startsWith("/compress-file"),
        href: "/compress-file",
      },
    ],
    [pathname, isOwner],
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
      <main
        className={twMerge(
          "relative z-10 h-full flex-1 overflow-y-auto overflow-x-hidden scrollbar rounded-lg py-2 pr-2",
          isIframe && "rounded-none py-0 pr-0",
        )}>
        {children}
      </main>
    </div>
  )
}

export default Sidebar
