import { TbPlaylist } from "react-icons/tb"
import { AiOutlinePlus } from "react-icons/ai"

import { useUser } from "@/hooks/useUser"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import useUploadModal from "@/hooks/useUploadModal"
import { Song } from "@/types"
import MediaItem from "./MediaItem"
import useOnPlay from "@/hooks/useOnPlay"
import { handleAuthAction } from "@/app/utils/handleAuthAction"

interface LibraryProps {
  songs: Song[]
}

const Library = ({ songs }: LibraryProps) => {
  const uploadModal = useUploadModal()
  const { user } = useUser()
  const isIframe = useIsIframeAuth()

  const onPlay = useOnPlay(songs)

  const onClick = () => {
    if (!user) {
      return handleAuthAction({ isIframe })
    }

    return uploadModal.onOpen()
  }

  return (
    <div className="flex flex-col ">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="inline-flex items-center gap-2">
          <TbPlaylist className="text-neutral-400" size={26} />
          <p className="text-neutral-400 font-medium text-md">Your libray</p>
        </div>
        <AiOutlinePlus
          className="text-neutral-400 cursor-pointer hover:text-white transition"
          onClick={onClick}
          size={20}
        />
      </div>
      <div className="mx-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
        Music upload is available for everyone - try now!
      </div>
      <div className="mt-3 flex flex-col gap-y-2 px-3">
        {songs.map(song => (
          <MediaItem onClick={(id: string) => onPlay(id)} key={song.id} data={song} />
        ))}
      </div>
    </div>
  )
}

export default Library
