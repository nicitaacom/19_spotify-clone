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
export const SECTOR = 45 // degrees between adjacent speakers

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
 * Gains for all 8 speakers when the orbiting source is at `angleDeg`. Only the two
 * adjacent speakers are nonzero; they equal-power crossfade (constant perceived
 * loudness, no clicks). Sum of squares === 1.
 */
export function orbitGains(angleDeg: number): number[] {
  const a = ((angleDeg % 360) + 360) % 360
  const lower = Math.floor(a / SECTOR) % SPEAKER_COUNT // speaker just behind the source
  const upper = (lower + 1) % SPEAKER_COUNT // speaker just ahead
  const f = (a - lower * SECTOR) / SECTOR // 0..1 within the sector
  const gains = new Array<number>(SPEAKER_COUNT).fill(0)
  gains[lower] = Math.cos((f * Math.PI) / 2)
  gains[upper] = Math.sin((f * Math.PI) / 2)
  return gains
}

/** Orbit angle (degrees) for a playback position. direction: 1 = clockwise, -1 = counter-clockwise. */
export function orbitAngle(positionSec: number, periodSec: number, direction: 1 | -1): number {
  return direction * (positionSec / periodSec) * 360
}
