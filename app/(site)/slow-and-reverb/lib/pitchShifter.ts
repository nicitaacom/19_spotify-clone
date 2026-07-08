export interface PitchShifter {
  input: GainNode
  output: GainNode
  setRatio(ratio: number, time: number): void
}

// Grain period; each delay line plays 0.1s grains, overlapped 50% by the other line.
const ACTIVE_TIME = 0.1
const FADE_TIME = 0.05

// Output rate = 1 - d(delayTime)/dt, so a delay ramp of amplitude D over ACTIVE_TIME
// shifts pitch by 1 - D/ACTIVE_TIME (down-ramp) or 1 + D/ACTIVE_TIME (up-ramp).
// D = |1 - ratio| * ACTIVE_TIME gives the exact requested ratio.
const MIN_RATIO = 0.5 // -12 st
const MAX_RATIO = 2.0 // +12 st

function createRampBuffer(ctx: BaseAudioContext, shiftUp: boolean): AudioBuffer {
  const length = Math.floor(ACTIVE_TIME * ctx.sampleRate)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const ramp = i / length
    data[i] = shiftUp ? 1 - ramp : ramp
  }
  return buffer
}

function createFadeBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.floor(ACTIVE_TIME * ctx.sampleRate)
  const fadeLength = Math.floor(FADE_TIME * ctx.sampleRate)
  const fadeOutStart = length - fadeLength
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    // Equal-power crossfade so the two half-grain-offset lines sum to constant power.
    if (i < fadeLength) {
      data[i] = Math.sqrt(i / fadeLength)
    } else if (i >= fadeOutStart) {
      data[i] = Math.sqrt(1 - (i - fadeOutStart) / fadeLength)
    } else {
      data[i] = 1
    }
  }
  return buffer
}

/**
 * Granular pitch shifter (port of Chrome's jungle.js technique):
 * two delay lines whose delayTime ramps sawtooth-style, half a grain out of
 * phase, gated by equal-power fades that mute each line while its ramp resets.
 * Built only from standard nodes so it renders identically in OfflineAudioContext.
 * Ratio > 1 = higher pitch, < 1 = lower; bypassed (dry) at ratio 1.
 */
export function createPitchShifter(ctx: BaseAudioContext): PitchShifter {
  const input = ctx.createGain()
  const output = ctx.createGain()

  const delay1 = ctx.createDelay(1.0)
  const delay2 = ctx.createDelay(1.0)

  // Envelope gains — fade buffers provide the entire gain value (base 0).
  const gain1 = ctx.createGain()
  const gain2 = ctx.createGain()
  gain1.gain.value = 0
  gain2.gain.value = 0

  const dry = ctx.createGain()
  const wet = ctx.createGain()

  const downBuffer = createRampBuffer(ctx, false)
  const upBuffer = createRampBuffer(ctx, true)
  const fadeBuffer = createFadeBuffer(ctx)
  const halfGrain = ACTIVE_TIME / 2

  const makeLoopSource = (buffer: AudioBuffer, offset: number) => {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.start(0, offset)
    return src
  }

  // Direction is selected by gating the down/up ramp pair; magnitude by modGainN.
  const gateDown = ctx.createGain()
  const gateUp = ctx.createGain()
  gateDown.gain.value = 1
  gateUp.gain.value = 0

  const modGain1 = ctx.createGain()
  const modGain2 = ctx.createGain()
  modGain1.gain.value = 0
  modGain2.gain.value = 0

  makeLoopSource(downBuffer, 0).connect(gateDown)
  makeLoopSource(upBuffer, 0).connect(gateUp)
  gateDown.connect(modGain1)
  gateUp.connect(modGain1)

  const gateDown2 = ctx.createGain()
  const gateUp2 = ctx.createGain()
  gateDown2.gain.value = 1
  gateUp2.gain.value = 0

  makeLoopSource(downBuffer, halfGrain).connect(gateDown2)
  makeLoopSource(upBuffer, halfGrain).connect(gateUp2)
  gateDown2.connect(modGain2)
  gateUp2.connect(modGain2)

  modGain1.connect(delay1.delayTime)
  modGain2.connect(delay2.delayTime)

  makeLoopSource(fadeBuffer, 0).connect(gain1.gain)
  makeLoopSource(fadeBuffer, halfGrain).connect(gain2.gain)

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
    const r = Math.max(MIN_RATIO, Math.min(MAX_RATIO, ratio))

    if (Math.abs(r - 1) < 0.001) {
      dry.gain.setTargetAtTime(1, time, 0.01)
      wet.gain.setTargetAtTime(0, time, 0.01)
      return
    }

    dry.gain.setTargetAtTime(0, time, 0.01)
    wet.gain.setTargetAtTime(1, time, 0.01)

    const shiftUp = r > 1
    gateDown.gain.setTargetAtTime(shiftUp ? 0 : 1, time, 0.01)
    gateDown2.gain.setTargetAtTime(shiftUp ? 0 : 1, time, 0.01)
    gateUp.gain.setTargetAtTime(shiftUp ? 1 : 0, time, 0.01)
    gateUp2.gain.setTargetAtTime(shiftUp ? 1 : 0, time, 0.01)

    const delayAmount = Math.abs(1 - r) * ACTIVE_TIME
    modGain1.gain.setTargetAtTime(delayAmount, time, 0.01)
    modGain2.gain.setTargetAtTime(delayAmount, time, 0.01)
  }

  setRatio(1, 0)

  return { input, output, setRatio }
}
