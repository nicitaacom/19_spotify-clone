"use server"

import { supabaseAdmin } from "@/libs/supabaseAdmin"
import { SUPABASE_FREE_TIER_LIMIT_BYTES } from "@/consts/storage"

const STORAGE_BUCKETS = ["songs", "images"]
const PAGE_SIZE = 1000

// Storage answers one folder at a time. An entry with an id is an object and its metadata holds
// the byte size; an entry without one is a folder to walk into - uploads nest files under a
// playlist slug (getSafeStoragePath), so listing only the bucket root would miss most of them.
const sumFolderBytes = async (bucket: string, prefix: string): Promise<number> => {
  let total = 0
  let offset = 0

  for (;;) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: PAGE_SIZE, offset })

    if (error) throw new Error(`${bucket}: ${error.message}`)
    if (!data || data.length === 0) return total

    for (const entry of data) {
      if (entry.id) {
        total += Number(entry.metadata?.size ?? 0)
      } else {
        total += await sumFolderBytes(bucket, prefix ? `${prefix}/${entry.name}` : entry.name)
      }
    }

    if (data.length < PAGE_SIZE) return total
    offset += PAGE_SIZE
  }
}

// Reads the buckets themselves rather than summing 19_songs.size_bytes: that column was added
// after songs already existed and was never backfilled, so every earlier row is NULL and counted
// as 0 - which is why the bar read 0.00 GB on a project holding hundreds of megabytes.
const getStorageUsageAction = async (): Promise<{ usedBytes: number; limitBytes: number } | string> => {
  try {
    const perBucket = await Promise.all(STORAGE_BUCKETS.map(bucket => sumFolderBytes(bucket, "")))

    return {
      usedBytes: perBucket.reduce((total, bucketBytes) => total + bucketBytes, 0),
      limitBytes: SUPABASE_FREE_TIER_LIMIT_BYTES,
    }
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export default getStorageUsageAction
