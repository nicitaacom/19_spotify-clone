"use client"

import { useCallback, useEffect, useState } from "react"

import getStorageUsageAction from "@/actions/getStorageUsageAction"
import { SUPABASE_FREE_TIER_LIMIT_BYTES } from "@/consts/storage"

export const useStorageUsage = () => {
  const [isSkeleton, setIsSkeleton] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [usedBytes, setUsedBytes] = useState(0)
  const [limitBytes, setLimitBytes] = useState(SUPABASE_FREE_TIER_LIMIT_BYTES)

  const fetchFn = useCallback(async () => {
    setErrorMessage("")
    try {
      setIsSkeleton(true)
      const result = await getStorageUsageAction()
      if (typeof result === "string") throw new Error(result)
      setUsedBytes(result.usedBytes)
      setLimitBytes(result.limitBytes)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSkeleton(false)
    }
  }, [])

  useEffect(() => {
    const runFetchFn = async () => {
      await fetchFn()
    }
    runFetchFn()
  }, [fetchFn])

  return {
    isSkeleton,
    errorMessage,
    usedBytes,
    limitBytes,
    refetch: fetchFn,
  }
}
