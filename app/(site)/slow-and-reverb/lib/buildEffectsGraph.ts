import { createImpulseResponse } from "./impulseResponse"

export interface EffectsParams {
  speed: number
  reverb: number
  bass: number // 0-100
}

export function buildEffectsGraph(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  params: EffectsParams,
) {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = params.speed

  const lowshelf = ctx.createBiquadFilter()
  lowshelf.type = "lowshelf"
  lowshelf.frequency.value = 200
  lowshelf.gain.value = (params.bass / 100) * 12

  const convolver = ctx.createConvolver()
  convolver.buffer = createImpulseResponse(ctx, 2.5, 2.5)

  const dryGain = ctx.createGain()
  dryGain.gain.value = 1

  const wetGain = ctx.createGain()
  wetGain.gain.value = params.reverb / 100

  // topology
  source.connect(lowshelf)
  lowshelf.connect(dryGain)
  lowshelf.connect(convolver)
  convolver.connect(wetGain)

  dryGain.connect(ctx.destination)
  wetGain.connect(ctx.destination)

  return { source, lowshelf, wetGain, dryGain }
}
