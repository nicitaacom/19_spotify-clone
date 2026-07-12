import { build8dGraph, EightDParams } from "./build8dGraph"
import { SPEAKER_COUNT, orbitGains, orbitAngle } from "./speakers"

const CURVE_HZ = 50 // sampling rate of the orbit-gain envelope curves

/**
 * Renders the 8D orbit offline to a stereo AudioBuffer, identical to live playback.
 * Output length == input length (the orbit adds no tail). Output is always stereo —
 * HRTF renders binaural stereo regardless of source channel count.
 *
 * Phase offset is always 0 for export (locked decision, §4.3.4): the export renders a
 * clean orbit from angle 0, so it's deterministic and independent of the live UI state.
 */
export async function renderOffline8d(
  buffer: AudioBuffer,
  params: EightDParams,
): Promise<AudioBuffer> {
  const length = Math.ceil(buffer.duration * buffer.sampleRate)
  const offCtx = new OfflineAudioContext(2, length, buffer.sampleRate)

  const graph = build8dGraph(offCtx, buffer, params)

  // Orbit automation via value curves. 50Hz sampling of a ≥2s rotation is far above the
  // Nyquist rate of the gain envelope — inaudible stepping, and setValueCurveAtTime
  // interpolates linearly between points anyway.
  const steps = Math.max(2, Math.ceil(buffer.duration * CURVE_HZ) + 1)
  const curves: Float32Array[] = []
  for (let i = 0; i < SPEAKER_COUNT; i++) curves.push(new Float32Array(steps))
  for (let k = 0; k < steps; k++) {
    const t = k / CURVE_HZ
    const g = orbitGains(orbitAngle(t, params.rotationPeriod, params.direction))
    for (let i = 0; i < SPEAKER_COUNT; i++) curves[i][k] = g[i]
  }
  for (let i = 0; i < SPEAKER_COUNT; i++) {
    graph.orbitGains[i].gain.setValueCurveAtTime(curves[i], 0, buffer.duration)
  }

  graph.source.start(0)
  return offCtx.startRendering()
}
