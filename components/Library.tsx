'use client'	

import {TbPlaylist} from 'react-icons/tb'
import {AiOutlinePlus} from 'react-icons/ai'
import { useUser } from "@/hooks/useUser"
import useAtuhModal from "@/hooks/useAuthModal"
import useUploadModal from "@/hooks/useUploadModal"
import { Song } from "@/types"
import MediaItem from "./MediaItem"

export default function Library ({songs}:{songs:Song[]}) {

  const authModal = useAtuhModal()
  const uploadModal = useUploadModal()
  const {user} = useUser()

const onClick = () => {
  console.log(user)
  if (!user) {
    return authModal.onOpen()
  }
  
  //TODO - Check for supscription
  return uploadModal.onOpen()
}

return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center px-5 py-4">
        <div className="inline-flex items-center gap-x-2">
          <TbPlaylist className='text-neutral-400' size={26}/>
          <p className="text-neutral-400 font-medium text-md">Your library</p>
        </div>
        <AiOutlinePlus className='text-neutral-400 cursor-pointer hover:text-white transition' size={20} onClick={onClick}/>
      </div>
      <div className="flex flex-col gap-y-2 mt-4 px-3">
        {songs.map(song => (
          <MediaItem data={song} key={song.id} onClick={() => {}}/>
        ))}
      </div>
    </div>
)
}