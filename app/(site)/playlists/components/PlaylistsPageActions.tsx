"use client"

import Button from "@/components/Button"
import { useUser } from "@/hooks/useUser"
import useCreatePlaylistModal from "@/hooks/useCreatePlaylistModal"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import { handleAuthAction } from "@/app/utils/handleAuthAction"

const PlaylistsPageActions = () => {
  const { user } = useUser()
  const createPlaylistModal = useCreatePlaylistModal()
  const isIframe = useIsIframeAuth()

  const handleClick = () => {
    if (!user) {
      return handleAuthAction({ isIframe })
    }

    createPlaylistModal.onOpen()
  }

  return <Button onClick={handleClick}>{user ? "Create playlist" : "Log in to create"}</Button>
}

export default PlaylistsPageActions
