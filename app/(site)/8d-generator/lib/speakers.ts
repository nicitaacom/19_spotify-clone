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

const POSITION_VECTOR_SCALE = SPEAKER_COUNT / 4

/**
 * Position in Web Audio space for a speaker at `angleDeg` (clockwise from front),
 * on the unit circle at radius 1 (== refDistance, so distance attenuation is 1 for
 * every speaker). The listener faces −z by default, so front (0°) = (0, 0, -1).
 */
export function speakerPosition(angleDeg: number): { x: number; y: number; z: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: Math.sin(rad), y: 0, z: -Math.cos(rad) } // front (0°) = (0, 0, -1)
}

/** Slider weights (0–1) whose cosine falloff reconstructs the requested source position. */
export function weightsForPosition(angleDeg: number, radius: number): number[] {
  const clampedRadius = Math.max(0, Math.min(1, radius))
  return SPEAKERS.map((speaker) => {
    const deltaRad = ((angleDeg - speaker.angleDeg) * Math.PI) / 180
    return clampedRadius * ((1 + Math.cos(deltaRad)) / 2)
  })
}

/**
 * The single 8D source position, steered by 8 direct vector contributions (each 0–1).
 * The scale is the inverse of `weightsForPosition`: for 8 evenly spaced speakers, its
 * cosine falloff sums to exactly twice the requested unit vector. Arbitrary manual mixes
 * are clamped to the unit circle so the panner never moves beyond its intended range.
 */
export function weightedPosition(weights: number[]): { x: number; y: number; z: number; radius: number } {
  let x = 0
  let z = 0
  for (let i = 0; i < SPEAKER_COUNT; i++) {
    const w = Math.max(0, Math.min(1, weights[i] ?? 0))
    if (w <= 0) continue
    const p = speakerPosition(SPEAKERS[i].angleDeg)
    x += p.x * w
    z += p.z * w
  }
  x /= POSITION_VECTOR_SCALE
  z /= POSITION_VECTOR_SCALE

  const magnitude = Math.hypot(x, z)
  if (magnitude > 1) {
    x /= magnitude
    z /= magnitude
  }

  const radius = Math.min(1, magnitude)
  return { x, y: 0, z, radius }
}

/** Angle (degrees, clockwise from front) of a weighted position — for the ring visual. */
export function positionAngle(x: number, z: number): number {
  // Inverse of speakerPosition: x = sin, z = -cos → angle = atan2(x, -z).
  const deg = (Math.atan2(x, -z) * 180) / Math.PI
  return (deg + 360) % 360
}
