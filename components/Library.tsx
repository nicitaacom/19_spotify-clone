import { useRouter } from "next/navigation"
import { TbPlaylist } from "react-icons/tb"
import { AiOutlinePlus } from "react-icons/ai"
import { FiEdit2 } from "react-icons/fi"

import { useUser } from "@/hooks/useUser"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import useUploadModal from "@/hooks/useUploadModal"
import useEditSongModal from "@/hooks/useEditSongModal"
import useOwnerStore from "@/hooks/useOwnerStore"
import { Song } from "@/types"
import AddToPlaylistButton from "./AddToPlaylistButton"
import MediaItem from "./MediaItem"
import useOnPlay from "@/hooks/useOnPlay"
import { handleAuthAction } from "@/app/utils/handleAuthAction"

interface LibraryProps {
  songs: Song[]
}

const Library = ({ songs }: LibraryProps) => {
  const router = useRouter()
  const uploadModal = useUploadModal()
  const editSongModal = useEditSongModal()
  const { user } = useUser()
  const isIframe = useIsIframeAuth()
  const { isOwner } = useOwnerStore()

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
        {isOwner && (
          <AiOutlinePlus
            className="text-neutral-400 cursor-pointer hover:text-neon transition"
            onClick={onClick}
            size={20}
          />
        )}
      </div>
      <div className="mx-3 rounded-md border border-neon/20 bg-neon/5 px-3 py-2 text-xs font-medium text-neon/80">
        {`Here you find the best songs I found in last ${new Date().getFullYear() - 2022} years of listening to music`}
      </div>
      <div className="mt-3 flex flex-col gap-y-2 px-3">
        {songs.map(song => (
          <div key={song.id} className="flex items-center gap-x-3">
            <div className="flex-1 min-w-0">
              <MediaItem onClick={(id: string) => onPlay(id)} data={song} />
            </div>
            {isOwner ? (
              <button
                type="button"
                aria-label={`Edit ${song.title}`}
                className="cursor-pointer text-neutral-300 transition hover:text-white hover:opacity-75"
                onClick={event => {
                  event.stopPropagation()
                  editSongModal.onOpen(song, () => router.refresh())
                }}>
                <FiEdit2 size={22} />
              </button>
            ) : (
              <AddToPlaylistButton song={song} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Library
