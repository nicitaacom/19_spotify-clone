"use client"

import AuthModal from "@/components/AuthModal"
import AddASongModal from "@/components/AddASongModal"
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
      <AddASongModal />
    </>
  )
}
