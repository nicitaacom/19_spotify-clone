"use client"

import AuthModal from "@/components/AuthModal"
import UploadModal from "@/components/UploadModal"
import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => {}

export default function ModalProvider() {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

  if (!isMounted) {
    return null
  }

  return (
    <>
      <AuthModal />
      <UploadModal />
    </>
  )
}
