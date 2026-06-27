"use client"
import { useEffect, useState } from "react"

import AuthModal from "../../components/AuthModal"
import AddToPlaylistModal from "../../components/AddToPlaylistModal"
import CreatePlaylistModal from "../../components/CreatePlaylistModal"
import DbBackupModal from "../../components/DbBackupModal"
import EditSongModal from "../../components/EditSongModal"
import UploadModal from "../../components/UploadModal"

export default function ModalProvider() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return null
  }

  return (
    <>
      <AuthModal />
      <CreatePlaylistModal />
      <AddToPlaylistModal />
      <DbBackupModal />
      <EditSongModal />
      <UploadModal />
    </>
  )
}
