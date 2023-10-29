import { Song } from "@/types"

import usePlayer from "./usePlayer"
import useAtuhModal from "./useAuthModal"
import { useUser } from "@/hooks/useUser"

const useOnPlay = (songs: Song[]) => {
  const player = usePlayer()

  const authModal = useAtuhModal()
  const { user } = useUser()

  const onPlay = (id: string) => {
    if (!user) {
      return authModal.onOpen()
    }
    console.log(16, "we are here")
    player.setId(id)
    player.setIds(songs.map(song => song.id))
  }

  return onPlay
}

export default useOnPlay
