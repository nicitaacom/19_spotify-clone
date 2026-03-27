import { Song } from "@/types"

import usePlayer from "./usePlayer"
import useIsIframeAuth from "./useIsIframeAuth"
import { useUser } from "./useUser"
import { handleAuthAction } from "@/app/utils/handleAuthAction"

const useOnPlay = (songs: Song[]) => {
  const player = usePlayer()
  const { user } = useUser()
  const isIframe = useIsIframeAuth()

  const onPlay = (id: string) => {
    if (!user) {
      return handleAuthAction({ isIframe })
    }

    player.setId(id)
    player.setIds(songs.map(song => song.id))
  }

  return onPlay
}

export default useOnPlay
