import { weightedPosition } from "./speakers"

export interface EightDParams {
  mixerVolumes: number[] // length 8, each 0–1 (slider % / 100) — the direction weights
  enabled: boolean // 8D on/off (off = clean dry signal)
}

export interface EightDGraph {
  source: AudioBufferSourceNode
  dryGain: GainNode // clean path level (1 when 8D off)
  wetGain: GainNode // spatialized path level (1 when 8D on)
  panner: PannerNode // the SINGLE HRTF panner — only one, so no comb filtering
  master: GainNode
}

/**
 * 8D as a DRY / WET crossfade around a SINGLE HRTF panner.
 *
 *   source ─► dryGain ───────────────► master ─► destination   (clean, no panner)
 *          └► wetGain ─► panner ─────► master                   (one HRTF position)
 *
 * Why one panner: summing the same signal through multiple HRTF panners sums delayed
 * copies → comb filtering (the "ripping"). With exactly one panner there's nothing to
 * sum against on the wet path, so it stays clean. The 8 sliders don't each get a panner
 * — together they steer the single panner's POSITION (weightedPosition).
 *
 * dry/wet are a crossfade, not a sum: 8D off → dry 1 / wet 0 (bit-clean original);
 * 8D on → dry 0 / wet 1. The engine ramps between them so the toggle doesn't click.
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

  const dryGain = ctx.createGain()
  dryGain.gain.value = params.enabled ? 0 : 1

  const wetGain = ctx.createGain()
  wetGain.gain.value = params.enabled ? 1 : 0

  const pos = weightedPosition(params.mixerVolumes)
  const panner = new PannerNode(ctx, {
    panningModel: "HRTF",
    distanceModel: "inverse",
    refDistance: 1,
    positionX: pos.x,
    positionY: pos.y,
    positionZ: pos.z,
  })

  source.connect(dryGain)
  dryGain.connect(master)

  source.connect(wetGain)
  wetGain.connect(panner)
  panner.connect(master)

  return { source, dryGain, wetGain, panner, master }
}
