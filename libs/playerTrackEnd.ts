// A signed storage file can jump back to 0 when it finishes. That jump is the end of the song.

export const END_WINDOW_SEC = 0.45
const RESTART_FROM_SEC = 2
const RESTART_TO_SEC = 1

export type PlaybackSample = {
  durationSec: number
  positionSec: number
  previousSec: number
  ended: boolean
  paused: boolean
  recovering: boolean
  seeking: boolean
}

export type PlaybackStep = "advance" | "ignore" | "continue"

export function trackFinished(durationSec: number, positionSec: number, ended: boolean): boolean {
  if (ended) return true
  if (!Number.isFinite(durationSec) || durationSec <= 0) return false
  if (!Number.isFinite(positionSec)) return false
  return durationSec - positionSec <= END_WINDOW_SEC
}

export function playbackStep(sample: PlaybackSample): PlaybackStep {
  if (sample.seeking || sample.recovering) return "ignore"
  if (sample.ended) return "advance"
  if (sample.paused) return "ignore"
  if (!Number.isFinite(sample.positionSec)) return "ignore"

  const previous = sample.previousSec
  if (previous >= RESTART_FROM_SEC && sample.positionSec <= RESTART_TO_SEC && sample.positionSec + 1 < previous) {
    return "advance"
  }

  if (!Number.isFinite(sample.durationSec) || sample.durationSec <= 0 || previous < 0) return "continue"
  if (sample.durationSec - sample.positionSec > END_WINDOW_SEC) return "continue"
  if (sample.positionSec <= previous + 0.02) return "advance"
  return "continue"
}
