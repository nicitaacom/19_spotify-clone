import { SPEAKERS, SPEAKER_COUNT, speakerPosition } from "./speakers"

export interface EightDParams {
  mixerVolumes: number[] // length 8, each 0–1 (slider % / 100)
}

export interface EightDGraph {
  source: AudioBufferSourceNode
  userGains: GainNode[] // length 8 — the mixer sliders
  master: GainNode
}

/**
 * Single source of truth for the 8D node graph — used by BOTH the live AudioContext
 * and the OfflineAudioContext render, so what you hear is what you export.
 *
 * Static 8-channel HRTF mixer: the full track plays through all 8 fixed speakers at
 * once, each scaled by its own volume. No rotation — the sound sits in space, shaped
 * by the 8 sliders.
 *
 * Per speaker i:
 *   source ─► userGain[i] ─► PannerNode[i](HRTF) ─► master ─► destination
 *
 * The builder does NOT start the source — callers own that.
 */
export function build8dGraph(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  params: EightDParams,
): EightDGraph {
  const source = ctx.createBufferSource()
  source.buffer = buffer

  const master = ctx.createGain()
  // Up to 8 HRTF speakers sum at the master. Volumes default to 1; the summed level
  // is the user's responsibility via the sliders, so no auto-compensation here.
  master.gain.value = 1
  master.connect(ctx.destination)

  const userGainNodes: GainNode[] = []

  for (let i = 0; i < SPEAKER_COUNT; i++) {
    const pos = speakerPosition(SPEAKERS[i].angleDeg)

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

    source.connect(userGain)
    userGain.connect(panner)
    panner.connect(master)

    userGainNodes.push(userGain)
  }

  return { source, userGains: userGainNodes, master }
}
