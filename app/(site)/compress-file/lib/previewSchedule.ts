export const PREVIEW_CHUNK_SEC = 10

export function chunkStartSec(positionSec: number, chunkSec = PREVIEW_CHUNK_SEC): number {
  if (!Number.isFinite(positionSec) || positionSec <= 0) return 0
  const size = chunkSec > 0 ? chunkSec : PREVIEW_CHUNK_SEC
  return Math.floor(positionSec / size) * size
}

// The following part starts encoding once half of this part has played - 5s into a 10s part, so 5, 15, 25s.
// A part that took longer than that half to encode starts the following one earlier, so it is ready in time.
export function nextEncodeAtSec(startSec: number, chunkSec: number, encodeMs: number): number {
  const encodeSec = Number.isFinite(encodeMs) && encodeMs > 0 ? encodeMs / 1000 : 0
  const into = Math.min(chunkSec / 2, chunkSec - encodeSec)
  return startSec + Math.max(0, into)
}

export function shouldEncodeNext(positionSec: number, startSec: number, chunkSec: number, encodeMs: number): boolean {
  return positionSec >= nextEncodeAtSec(startSec, chunkSec, encodeMs)
}
