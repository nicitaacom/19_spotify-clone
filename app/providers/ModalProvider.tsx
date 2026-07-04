"use client"
import { useEffect, useState } from "react"

import AuthModal from "../../components/AuthModal"
import AddToPlaylistModal from "../../components/AddToPlaylistModal"
import CreatePlaylistModal from "../../components/CreatePlaylistModal"
import DbBackupModal from "@/app/features/backup/DbBackupModal"
import EditSongModal from "../../components/EditSongModal"
import SearchModal from "../../components/SearchModal"
import UploadModal from "../../components/UploadModal"
import { AreYouSureModalsProvider } from "../../components/modals/AreYouSureModalsProvider"

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
      <SearchModal />
      <AuthModal />
      <CreatePlaylistModal />
      <AddToPlaylistModal />
      <DbBackupModal />
      <EditSongModal />
      <UploadModal />
      <AreYouSureModalsProvider />
    </>
  )
}
