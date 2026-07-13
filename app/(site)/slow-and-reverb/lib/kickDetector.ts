// Kick/808 onset detector — pure closure, no React and no Web Audio. It takes a stream of
// sub-bass RMS samples (linear, 0..~1) and returns per-call onset strength (0..1). It's
// deliberately signal-agnostic and hand-testable: feed it numbers, assert the output.
//
// Song-independence is by construction: a kick is detected as a spike RELATIVE to the
// track's own recent average (ratio), never an absolute level — so a quiet lo-fi track and
// a slammed EDM master idle near ratio 1 and both spike to 2–4× on a kick, mapping to the
// same visual strength. Hats/claps/vocals are already gone before this: the caller feeds
// RMS from a hard-lowpassed tap, so this only ever sees the kick band.

export interface KickDetector {
  /** Feed one RMS sample (linear 0..~1). Returns onset strength 0..1 (0 = no kick this frame). */
  update(rms: number, nowMs: number): number
  reset(): void
}

// The ONLY tuning knobs (exported for tests / the §3 tuning pass).
export const HISTORY_LEN = 43 // ~0.7 s of frames at 60 fps — the "recent average" window
export const WARMUP_FRAMES = 12 // return 0 until this many samples seen (~200 ms after play/seek)
export const ABS_FLOOR = 0.008 // linear RMS (~ -42 dBFS): below this = silence, never fire
export const TRIGGER_RATIO = 1.5 // fire when rms > TRIGGER_RATIO × recent mean
export const FULL_RATIO = 3.0 // rms at (or above) FULL_RATIO × mean = full-strength pulse (1.0)
export const REFRACTORY_MS = 120 // min gap between onsets — one kick can't double-fire

export function createKickDetector(): KickDetector {
  const history = new Float32Array(HISTORY_LEN)
  let writeIdx = 0
  let count = 0
  let sum = 0
  let lastOnsetMs = -Infinity

  const push = (rms: number) => {
    // Circular buffer with an O(1) running sum (no per-frame scans).
    const old = count < HISTORY_LEN ? 0 : history[writeIdx]
    history[writeIdx] = rms
    writeIdx = (writeIdx + 1) % HISTORY_LEN
    sum += rms - old
    if (count < HISTORY_LEN) count++
  }

  return {
    update(rms: number, nowMs: number): number {
      // The spike itself joins the average — back-to-back kicks adapt (get less shocking).
      push(rms)

      if (count < WARMUP_FRAMES) return 0

      const mean = sum / count
      // Silence / near-silence guard: no firing, and no divide-by-tiny explosions.
      if (rms < ABS_FLOOR || mean < ABS_FLOOR / 2) return 0

      if (nowMs - lastOnsetMs < REFRACTORY_MS) return 0

      const ratio = rms / mean
      if (ratio <= TRIGGER_RATIO) return 0

      lastOnsetMs = nowMs
      return Math.min(1, (ratio - TRIGGER_RATIO) / (FULL_RATIO - TRIGGER_RATIO))
    },

    reset(): void {
      history.fill(0)
      writeIdx = 0
      count = 0
      sum = 0
      lastOnsetMs = -Infinity
    },
  }
}
