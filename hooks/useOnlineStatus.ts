"use client"

import { useSyncExternalStore } from "react"

const subscribe = (onStoreChange: () => void) => {
  window.addEventListener("online", onStoreChange)
  window.addEventListener("offline", onStoreChange)

  return () => {
    window.removeEventListener("online", onStoreChange)
    window.removeEventListener("offline", onStoreChange)
  }
}

const getSnapshot = () => navigator.onLine
const getServerSnapshot = () => true

const useOnlineStatus = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

export default useOnlineStatus
