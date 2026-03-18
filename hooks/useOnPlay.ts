import { Song } from "@/types"

import usePlayer from "./usePlayer"
import useIsIframeAuth from "./useIsIframeAuth"
import { useUser } from "./useUser"
import useSubscribeModal from "./useSubscribeModal"
import { handleAuthAction } from "@/app/utils/handleAuthAction"

const useOnPlay = (songs: Song[]) => {
  const subscribeModal = useSubscribeModal()
  const player = usePlayer()
  const { subscription, user } = useUser()
  const isIframe = useIsIframeAuth()

  const onPlay = (id: string) => {
    if (!user) {
      return handleAuthAction({ isIframe })
    }

    if (!subscription) {
      return subscribeModal.onOpen()
    }

    player.setId(id)
    player.setIds(songs.map(song => song.id))
  }

  return onPlay
}

export default useOnPlay
