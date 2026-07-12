export interface Speaker {
  id: string
  label: string
  angleDeg: number
}

export const SPEAKERS: readonly Speaker[] = [
  { id: "front", label: "Front", angleDeg: 0 },
  { id: "front-right", label: "Front Right", angleDeg: 45 },
  { id: "right", label: "Right", angleDeg: 90 },
  { id: "rear-right", label: "Rear Right", angleDeg: 135 },
  { id: "rear", label: "Rear", angleDeg: 180 },
  { id: "rear-left", label: "Rear Left", angleDeg: 225 },
  { id: "left", label: "Left", angleDeg: 270 },
  { id: "front-left", label: "Front Left", angleDeg: 315 },
] as const

export const SPEAKER_COUNT = 8

/**
 * Position in Web Audio space for a speaker at `angleDeg` (clockwise from front),
 * on the unit circle at radius 1 (== refDistance, so distance attenuation is 1 for
 * every speaker). The listener faces −z by default, so front (0°) = (0, 0, -1).
 */
export function speakerPosition(angleDeg: number): { x: number; y: number; z: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: Math.sin(rad), y: 0, z: -Math.cos(rad) } // front (0°) = (0, 0, -1)
}

/**
 * The single 8D source position, steered by the 8 slider weights (each 0–1). Computed as
 * a weighted vector sum of the speaker directions on the unit circle — so the direction
 * wraps correctly (e.g. Left-ish 350° + 10° averages to front, not to the back) and the
 * "spread" (magnitude) shrinks as opposite channels balance out.
 *
 * Returns a position on/inside the unit circle: `radius` is how strongly the sound is
 * pulled to one side (1 = fully to a direction, 0 = centered/no preference).
 * With all weights 0 → radius 0 (centered).
 */
export function weightedPosition(weights: number[]): { x: number; y: number; z: number; radius: number } {
  let x = 0
  let z = 0
  let total = 0
  for (let i = 0; i < SPEAKER_COUNT; i++) {
    const w = weights[i] ?? 0
    if (w <= 0) continue
    const p = speakerPosition(SPEAKERS[i].angleDeg)
    x += p.x * w
    z += p.z * w
    total += w
  }
  if (total <= 0) return { x: 0, y: 0, z: 0, radius: 0 }
  x /= total
  z /= total
  const radius = Math.min(1, Math.hypot(x, z))
  return { x, y: 0, z, radius }
}

/** Angle (degrees, clockwise from front) of a weighted position — for the ring visual. */
export function positionAngle(x: number, z: number): number {
  // Inverse of speakerPosition: x = sin, z = -cos → angle = atan2(x, -z).
  const deg = (Math.atan2(x, -z) * 180) / Math.PI
  return (deg + 360) % 360
}
