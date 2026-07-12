import { SPEAKERS, SPEAKER_COUNT, orbitGains, orbitAngle, speakerPosition } from "./speakers"

export interface EightDParams {
  rotationPeriod: number // seconds per revolution, 2–20
  direction: 1 | -1 // 1 = clockwise
  mixerVolumes: number[] // length 8, each 0–1 (slider % / 100)
}

export interface EightDGraph {
  source: AudioBufferSourceNode
  orbitGains: GainNode[] // length 8 — automated by the orbit (engine rAF or offline curve)
  userGains: GainNode[] // length 8 — the mixer sliders
  master: GainNode
}

/**
 * Single source of truth for the 8D node graph — used by BOTH the live AudioContext
 * and the OfflineAudioContext render, so what you hear is what you export.
 *
 * Per speaker i:
 *   source ─► orbitGain[i] ─► userGain[i] ─► PannerNode[i](HRTF) ─► master ─► destination
 *
 * The builder does NOT start the source and does NOT automate the orbit over time —
 * callers own that (live: rAF; offline: setValueCurveAtTime).
 *
 * @param startOffsetSec playback offset the orbit starts at, so mid-track playback
 *   begins at the correct orbit position. Defaults to 0 (offline render always uses 0).
 */
export function build8dGraph(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  params: EightDParams,
  startOffsetSec = 0,
): EightDGraph {
  const source = ctx.createBufferSource()
  source.buffer = buffer

  const master = ctx.createGain()
  // Orbit gains are equal-power (sum of squares = 1) with at most 2 panners active,
  // so there is no clipping headroom problem — no compensation hack needed.
  master.gain.value = 1
  master.connect(ctx.destination)

  const startAngle = orbitAngle(startOffsetSec, params.rotationPeriod, params.direction)
  const initialGains = orbitGains(startAngle)

  const orbitGainNodes: GainNode[] = []
  const userGainNodes: GainNode[] = []

  for (let i = 0; i < SPEAKER_COUNT; i++) {
    const pos = speakerPosition(SPEAKERS[i].angleDeg)

    const orbitGain = ctx.createGain()
    orbitGain.gain.value = initialGains[i]

    const userGain = ctx.createGain()
    userGain.gain.value = params.mixerVolumes[i]

    const panner = new PannerNode(ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 1,
      positionX: pos.x,
      positionY: pos.y,
      positionZ: pos.z,
    })

    source.connect(orbitGain)
    orbitGain.connect(userGain)
    userGain.connect(panner)
    panner.connect(master)

    orbitGainNodes.push(orbitGain)
    userGainNodes.push(userGain)
  }

  return { source, orbitGains: orbitGainNodes, userGains: userGainNodes, master }
}
