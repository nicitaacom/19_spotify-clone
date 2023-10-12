'use client'

import useLoadImage from "@/hooks/useLoadImage"
import { Song } from "@/types"
import Image from "next/image"
import PlayButton from "./PlayButton"
import getSongsById from "@/actions/getSongsById"

interface SongItem {
  data:Song
  onClick:(id:string) => void
}

export default function SongItem ({data,onClick}:SongItem) {

  const imagePath = useLoadImage(data)


return (
    <div className="relative group flex flex-col gap-x-4 justify-center items-center rounded-md overflow-hidden
    bg-neutral-400/5 cursor-pointer hover:bg-neutral-400/10 transition p-3" onClick={() => onClick(data.id)}>
      <div className="relative aspect-square w-full h-full rounded-md overflow-hidden">
        <Image className="object-cover" src={imagePath || '/images/liked.png'} fill sizes='' alt='Image'/>
      </div>
           <div className="flex flex-col gap-y-1 items-start w-full pt-4">
          <p className="font-semibold truncate w-full">{data.title}</p>
          <p className="text-neutral-400 text-sm pb-4 w-full truncate">By {data.author}</p>
        </div>
        <div className="absolute bottom-24 right-5">
          <PlayButton/>
        </div>
    </div>
)
}