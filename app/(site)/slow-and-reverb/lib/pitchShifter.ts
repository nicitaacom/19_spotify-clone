export interface PitchShifter {
  input: GainNode
  output: GainNode
  setRatio(ratio: number, time: number): void
}

/**
 * Granular pitch shifter using two modulated delay lines (jungle technique).
 * Works identically in AudioContext and OfflineAudioContext.
 * Ratio > 1 = higher pitch, < 1 = lower.
 */
export function createPitchShifter(ctx: BaseAudioContext): PitchShifter {
  const input = ctx.createGain()
  const output = ctx.createGain()

  const delay1 = ctx.createDelay(1.0)
  const delay2 = ctx.createDelay(1.0)

  const gain1 = ctx.createGain()
  const gain2 = ctx.createGain()

  const dry = ctx.createGain()
  const wet = ctx.createGain()

  const grainSize = 0.10
  const makeBuffer = (length: number, fn: (i: number) => number) => {
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      data[i] = fn(i)
    }
    return buffer
  }

  const modBufferLength = Math.floor(ctx.sampleRate * grainSize * 2)
  const sawBuffer = makeBuffer(modBufferLength, (i) => (i / modBufferLength) * 2 - 1)
  const fadeBuffer = makeBuffer(modBufferLength, (i) => {
    const x = i / modBufferLength
    return x < 0.5 ? x * 2 : 2 - x * 2
  })

  const mod1 = ctx.createBufferSource()
  mod1.buffer = sawBuffer
  mod1.loop = true

  const mod2 = ctx.createBufferSource()
  mod2.buffer = sawBuffer
  mod2.loop = true

  const fade1 = ctx.createBufferSource()
  fade1.buffer = fadeBuffer
  fade1.loop = true

  const fade2 = ctx.createBufferSource()
  fade2.buffer = fadeBuffer
  fade2.loop = true

  mod1.start()
  mod2.start()
  fade1.start()
  fade2.start()

  const modGain1 = ctx.createGain()
  const modGain2 = ctx.createGain()
  modGain1.gain.value = grainSize
  modGain2.gain.value = grainSize

  const inverter = ctx.createGain()
  inverter.gain.value = -1

  mod1.connect(modGain1)
  modGain1.connect(delay1.delayTime)

  mod2.connect(inverter)
  inverter.connect(modGain2)
  modGain2.connect(delay2.delayTime)

  fade1.connect(gain1.gain)
  fade2.connect(gain2.gain)

  gain1.gain.value = 0.5
  gain2.gain.value = 0.5

  input.connect(dry)
  input.connect(delay1)
  input.connect(delay2)

  delay1.connect(gain1)
  delay2.connect(gain2)

  gain1.connect(wet)
  gain2.connect(wet)

  dry.connect(output)
  wet.connect(output)

  dry.gain.value = 1
  wet.gain.value = 0

  const setRatio = (ratio: number, time: number = 0) => {
    const r = Math.max(0.5, Math.min(1.5, ratio))

    if (Math.abs(r - 1) < 0.001) {
      dry.gain.setTargetAtTime(1, time, 0.01)
      wet.gain.setTargetAtTime(0, time, 0.01)
      return
    }

    dry.gain.setTargetAtTime(0, time, 0.01)
    wet.gain.setTargetAtTime(1, time, 0.01)

    const modRate = r
    mod1.playbackRate.setTargetAtTime(modRate, time, 0.02)
    mod2.playbackRate.setTargetAtTime(modRate, time, 0.02)

    const delayAmount = grainSize / r
    modGain1.gain.setTargetAtTime(delayAmount, time, 0.02)
    modGain2.gain.setTargetAtTime(delayAmount, time, 0.02)
  }

  setRatio(1, 0)

  return { input, output, setRatio }
}
