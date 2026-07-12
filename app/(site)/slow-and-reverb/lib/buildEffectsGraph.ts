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

  // Analyser tapped post-bass-boost so the background reacts to the low-end the
  // listener actually hears (kicks / 808s, including the Bass slider). It's a
  // passive tap — it never feeds destination, so it's inert on offline renders.
  const analyser = ctx.createAnalyser()
  // Bigger FFT → finer low-end resolution (binHz = sampleRate/2048 ≈ 21Hz), so the
  // kick/808 band (~20-150Hz) is several clean bins instead of a smeared handful.
  analyser.fftSize = 2048
  // Zero smoothing: the analyser must NOT time-average frames, or it blurs the very
  // transient the onset detector keys on. All smoothing/decay lives in AlbumArt's env.
  analyser.smoothingTimeConstant = 0
  lowshelf.connect(analyser)

  // topology with pitch shifter
  source.connect(shifter.input)
  shifter.output.connect(lowshelf)

  lowshelf.connect(dryGain)
  lowshelf.connect(convolver)
  convolver.connect(wetGain)

  dryGain.connect(ctx.destination)
  wetGain.connect(ctx.destination)

  return { source, lowshelf, wetGain, dryGain, pitchShifter: shifter, analyser }
}
