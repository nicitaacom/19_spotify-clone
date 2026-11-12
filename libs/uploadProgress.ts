/** Send fills 0–90. Store fills 90–99. The button leaves this state when the song row exists. */
export const SEND_QUIET_MS = 30_000
export const STORE_WAIT_FLOOR_MS = 3 * 60 * 1000
// while storing, GET /api/songs/upload-status is asked this often - a stored song ends the wait without the POST answer
export const STORED_CHECK_MS = 5_000

export function byteSendPercent(sent: number, total: number): number {
  if (!(total > 0) || sent <= 0) return 0
  return Math.min(90, Math.max(1, Math.round((sent / total) * 90)))
}

export function storePercent(waitedMs: number, estimateMs: number): number {
  if (!(estimateMs > 0)) return 90
  const ratio = Math.min(1, Math.max(0, waitedMs / estimateMs))
  return Math.min(99, Math.round(90 + ratio * 9))
}

export function remainingSendMs(sent: number, total: number, bytesPerSec: number): number | null {
  if (!(bytesPerSec > 0) || !(total > sent)) return null
  return ((total - sent) / bytesPerSec) * 1000
}

export function storeWaitLimitMs(sendMs: number): number {
  const doubled = sendMs > 0 ? sendMs * 2 : 0
  return Math.max(STORE_WAIT_FLOOR_MS, doubled)
}

export function formatTimeLeft(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) return "under 1s"
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `about ${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `about ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `about ${hours}h` : `about ${hours}h ${rest} min`
}

export function uploadButtonLabel(input: {
  preparing: boolean
  compressSizes: { fromBytes: number; toBytes: number } | null
  storing: boolean
  percent: number
  speed: string
  timeLeft: string
}): string {
  const percent = Math.min(99, Math.max(0, Math.round(input.percent)))
  const toMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1)
  // the bitrate is known once the file is read - until then nothing is compressing yet
  if (input.preparing && input.compressSizes) {
    return `Converting ${toMb(input.compressSizes.fromBytes)} MB -> ${toMb(input.compressSizes.toBytes)} MB… ${percent}%`
  }
  if (input.preparing) return `Reading audio… ${percent}%`
  if (input.storing) {
    const tail = input.timeLeft ? `${input.timeLeft} left` : "still working"
    return `Storing the song… ${percent}% · ${tail}`
  }
  const parts = [`Uploading… ${percent}%`]
  if (input.speed) parts.push(input.speed)
  if (input.timeLeft) parts.push(`${input.timeLeft} left`)
  return parts.join(" · ")
}
