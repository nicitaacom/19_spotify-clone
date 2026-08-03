"use client"

import { useStorageUsage } from "@/hooks/useStorageUsage"

const formatGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(2)

// Under a gigabyte "0.00 GB" reads as nothing stored, so show the megabytes that are actually there
const formatUsed = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) return `${formatGB(bytes)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

const StorageUsageBar = () => {
  const { usedBytes, limitBytes, isSkeleton, errorMessage } = useStorageUsage()

  const percentage = Math.min(100, (usedBytes / limitBytes) * 100)

  if (errorMessage) return <p className="text-xs text-red-400">{errorMessage}</p>

  return (
    <div className="flex flex-col gap-y-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div
          style={{ width: `${isSkeleton ? 0 : percentage}%` }}
          className="h-full rounded-full bg-neon shadow-neon-sm transition-all duration-200"
        />
      </div>
      <p className="text-xs text-neutral-400 text-right">
        {isSkeleton ? "Calculating…" : `${formatUsed(usedBytes)} / ${formatGB(limitBytes)} GB used`}
      </p>
    </div>
  )
}

export default StorageUsageBar
