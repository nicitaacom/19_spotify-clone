"use client"

import { useEffect } from "react"

import useOwnerStore from "@/hooks/useOwnerStore"

export const useSyncOwnerStore = (isOwner: boolean) => {
  const { setIsOwner } = useOwnerStore()

  useEffect(() => {
    setIsOwner(isOwner)
  }, [isOwner, setIsOwner])
}
