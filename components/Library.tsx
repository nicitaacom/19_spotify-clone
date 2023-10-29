import { TbPlaylist } from 'react-icons/tb'
import { AiOutlinePlus } from 'react-icons/ai'

import useAuthModal from "@/hooks/useAuthModal"
import { useUser } from "@/hooks/useUser"
import useUploadModal from "@/hooks/useUploadModal"
import { Song } from "@/types"
import MediaItem from "./MediaItem"
import useOnPlay from "@/hooks/useOnPlay"

interface LibraryProps {
  songs:Song[]
}

const Library = ({songs}:LibraryProps) => {
  
  const authModal = useAuthModal()
  const uploadModal = useUploadModal()
  const {user} = useUser()
  
  const onPlay = useOnPlay(songs)

  const onClick = () => {
    if (!user) {
      return authModal.onOpen()
    }
    // TODO: Check for subscription
    return uploadModal.onOpen()
  }

  return ( 
    <div className="flex flex-col ">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="inline-flex items-center gap-2">
          <TbPlaylist className='text-neutral-400' size={26}/>
          <p className='text-neutral-400 font-medium text-md'>
            Your libray
          </p>
        </div>
        <AiOutlinePlus
        className='text-neutral-400 cursor-pointer hover:text-white transition'
         onClick={onClick} size={20}/>
      </div>  
      <div className='flex flex-col gap-y-2 mt-4 px-3'>
        {songs.map(song => (
          <MediaItem onClick={(id:string) => onPlay(id)}
          key={song.id}
          data={song}/>
        ))}
      </div>
    </div>
   );
}
 
export default Library;