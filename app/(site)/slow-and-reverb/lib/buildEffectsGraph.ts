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

  // Kick-detection tap: clean pre-effects signal, hard low-passed so ONLY the kick/808
  // band reaches the analyser — hats/claps/vocals are filtered out BEFORE measurement
  // (frequency selectivity via real filters, not bin math). The hook reads time-domain
  // samples from kickAnalyser and computes RMS (see kickDetector.ts). Passive dead-end
  // chain: never connects to destination, so it's inert on offline renders.
  const kickLP1 = ctx.createBiquadFilter()
  kickLP1.type = "lowpass"
  kickLP1.frequency.value = 120 // covers kick fundamentals across speed 0.5–1.5
  kickLP1.Q.value = 0.707
  const kickLP2 = ctx.createBiquadFilter() // cascade → 24 dB/oct: treble truly gone, not -12dB
  kickLP2.type = "lowpass"
  kickLP2.frequency.value = 120
  kickLP2.Q.value = 0.707

  const kickAnalyser = ctx.createAnalyser()
  kickAnalyser.fftSize = 1024 // time-domain window ≈ 23 ms @ 44.1k — tight enough for attacks

  source.connect(kickLP1)
  kickLP1.connect(kickLP2)
  kickLP2.connect(kickAnalyser)

  // topology with pitch shifter
  source.connect(shifter.input)
  shifter.output.connect(lowshelf)

  lowshelf.connect(dryGain)
  lowshelf.connect(convolver)
  convolver.connect(wetGain)

  dryGain.connect(ctx.destination)
  wetGain.connect(ctx.destination)

  return { source, lowshelf, wetGain, dryGain, pitchShifter: shifter, kickAnalyser }
}
