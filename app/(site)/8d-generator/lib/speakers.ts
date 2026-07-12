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
