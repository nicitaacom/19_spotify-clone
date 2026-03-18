import { useSearchParams } from "next/navigation"
import { Song } from "@/types"

import usePlayer from "./usePlayer"
import { useUser } from "./useUser"
import useSubscribeModal from "./useSubscribeModal"
import { handleAuthAction } from "@/app/utils/handleAuthAction"

const useOnPlay = (songs: Song[]) => {
  const subscribeModal = useSubscribeModal()
  const player = usePlayer()
  const { subscription, user } = useUser()
  const searchParams = useSearchParams()
  const isIframe = searchParams.get("is_iframe") === "true"

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
