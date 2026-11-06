export const PREVIEW_CHUNK_SEC = 10

export function chunkStartSec(positionSec: number, chunkSec = PREVIEW_CHUNK_SEC): number {
  if (!Number.isFinite(positionSec) || positionSec <= 0) return 0
  const size = chunkSec > 0 ? chunkSec : PREVIEW_CHUNK_SEC
  return Math.floor(positionSec / size) * size
}

// A 10s part that took 5s to encode starts the following part at 5s.
export function nextEncodeAtSec(startSec: number, chunkSec: number, encodeMs: number): number {
  const encodeSec = Number.isFinite(encodeMs) && encodeMs > 0 ? encodeMs / 1000 : 0
  const into = chunkSec - encodeSec
  return startSec + Math.max(0, into)
}

export function shouldEncodeNext(positionSec: number, startSec: number, chunkSec: number, encodeMs: number): boolean {
  return positionSec >= nextEncodeAtSec(startSec, chunkSec, encodeMs)
}
