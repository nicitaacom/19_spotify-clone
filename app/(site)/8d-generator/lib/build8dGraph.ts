import { SPEAKERS, SPEAKER_COUNT, speakerPosition } from "./speakers"

export interface EightDParams {
  mixerVolumes: number[] // length 8, each 0–1 (slider % / 100)
}

export interface EightDGraph {
  source: AudioBufferSourceNode
  dryGain: GainNode // the clean, unspatialized backbone — always full
  sendGains: GainNode[] // length 8 — per-direction HRTF send levels (the sliders)
  master: GainNode
}

// How loud a fully-raised (100%) HRTF send is relative to the dry signal. Kept well
// below 1 so a send adds a *hint* of direction on top of the clean dry backbone rather
// than a second full-level delayed copy — that's what avoids the comb-filter "reeping".
export const SEND_SCALE = 0.6

/**
 * 8D graph as a DRY backbone + 8 additive HRTF sends.
 *
 *   source ─► dryGain ───────────────────────────────► master ─► destination   (clean, no panner)
 *          └► sendGain[i] ─► PannerNode[i](HRTF) ─► master                       (×8, subtle)
 *
 * With every send at 0 the output is exactly the clean original (no HRTF in the path, so
 * no comb filtering). Raising send[i] leans the spatial image toward direction i. Because
 * the dry signal is never spatialized and the sends are scaled by SEND_SCALE, you add
 * directional flavor without stacking 8 loud delayed copies.
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
  master.gain.value = 1
  master.connect(ctx.destination)

  // Dry backbone: the clean original, straight through, always on.
  const dryGain = ctx.createGain()
  dryGain.gain.value = 1
  source.connect(dryGain)
  dryGain.connect(master)

  const sendGainNodes: GainNode[] = []

  for (let i = 0; i < SPEAKER_COUNT; i++) {
    const pos = speakerPosition(SPEAKERS[i].angleDeg)

    const sendGain = ctx.createGain()
    sendGain.gain.value = params.mixerVolumes[i] * SEND_SCALE

    const panner = new PannerNode(ctx, {
      panningModel: "HRTF",
      distanceModel: "inverse",
      refDistance: 1,
      positionX: pos.x,
      positionY: pos.y,
      positionZ: pos.z,
    })

    source.connect(sendGain)
    sendGain.connect(panner)
    panner.connect(master)

    sendGainNodes.push(sendGain)
  }

  return { source, dryGain, sendGains: sendGainNodes, master }
}
