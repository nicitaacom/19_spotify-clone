"use server"

import { createServerComponentClient } from "@/libs/supabaseServer"

export const SUPABASE_FREE_TIER_LIMIT_BYTES = 5 * 1024 * 1024 * 1024

const getStorageUsageAction = async (): Promise<{ usedBytes: number; limitBytes: number } | string> => {
  const supabase = await createServerComponentClient()

  const { data, error } = await supabase.from("19_songs").select("size_bytes")

  if (error) return error.message

  const usedBytes = (data ?? []).reduce((total, row) => total + (row.size_bytes ?? 0), 0)

  return { usedBytes, limitBytes: SUPABASE_FREE_TIER_LIMIT_BYTES }
}

export default getStorageUsageAction
