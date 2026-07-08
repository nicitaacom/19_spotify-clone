import { createImpulseResponse } from "./impulseResponse"
import { createPitchShifter } from "./pitchShifter"

export interface EffectsParams {
  speed: number
  reverb: number
  bass: number // 0-100
  pitchSemitones: number // -12..+12, transposes on top of speed's natural pitch
  pitchEnabled: boolean
}

export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12)
}

export function buildEffectsGraph(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  params: EffectsParams,
) {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = params.speed

  const shifter = createPitchShifter(ctx)
  const ratio = params.pitchEnabled ? semitonesToRatio(params.pitchSemitones) : 1
  shifter.setRatio(ratio, 0)

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

  // topology with pitch shifter
  source.connect(shifter.input)
  shifter.output.connect(lowshelf)

  lowshelf.connect(dryGain)
  lowshelf.connect(convolver)
  convolver.connect(wetGain)

  dryGain.connect(ctx.destination)
  wetGain.connect(ctx.destination)

  return { source, lowshelf, wetGain, dryGain, pitchShifter: shifter }
}
