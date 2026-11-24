import { Mp3Encoder } from "@breezystack/lamejs"

// lamejs can corrupt its PCM state when its internal resampler consumes a fractional input count.
// Give it PCM at the rate it will actually encode, including the lower rates used at small bitrates.
export function mp3EncodingSampleRate(sourceRate: number, kbps: number, channels: number): number {
  const bandwidths = [[8, 2000], [16, 3700], [24, 3900], [32, 5500], [40, 7000], [48, 7500],
    [56, 10000], [64, 11000], [80, 13500], [96, 15100], [112, 15600], [128, 17000],
    [160, 17500], [192, 18600], [224, 19400], [256, 19700], [320, 20500]]
  const closest = bandwidths.reduce((best, entry) => Math.abs(entry[0] - kbps) <= Math.abs(best[0] - kbps) ? entry : best)
  const bandwidth = closest[1] * (channels === 1 ? 1.5 : 1)
  const limits = [[3970, 8000], [4510, 11025], [5420, 12000], [7230, 16000],
    [9970, 22050], [11220, 24000], [15250, 32000], [15960, 44100]]
  const limit = limits.find(([cutoff]) => bandwidth <= cutoff)?.[1] ?? 48000
  const supported = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]
  return supported.filter(rate => rate <= Math.min(sourceRate, limit)).at(-1) ?? 8000
}

const HALF_TAPS = 16
const PHASES = 1024

// Carry the filter history and fractional position across chunks. Memory stays bounded for hour-long audio.
class StreamingResampler {
  private left = new Float32Array(0)
  private right = new Float32Array(0)
  private start = 0
  private inputSamples = 0
  private outputSamples = 0
  private ratio: number
  private filters: Float64Array[]
  private channels: number

  constructor(sourceRate: number, targetRate: number, channels: number) {
    this.ratio = sourceRate / targetRate
    this.channels = channels
    const cutoff = Math.min(1, targetRate / sourceRate) * 0.95
    this.filters = Array.from({ length: PHASES + 1 }, (_, phase) => {
      const weights = new Float64Array(HALF_TAPS * 2)
      let sum = 0
      for (let tap = 0; tap < weights.length; tap++) {
        const distance = tap - HALF_TAPS + 1 - phase / PHASES
        const x = Math.PI * cutoff * distance
        const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(x) / x
        const window = Math.abs(distance) >= HALF_TAPS ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * distance / HALF_TAPS)
        weights[tap] = cutoff * sinc * window
        sum += weights[tap]
      }
      for (let tap = 0; tap < weights.length; tap++) weights[tap] /= sum
      return weights
    })
  }

  push(left: Float32Array, right: Float32Array, final = false): [Float32Array, Float32Array] {
    const append = (before: Float32Array, next: Float32Array) => {
      const joined = new Float32Array(before.length + next.length)
      joined.set(before)
      joined.set(next, before.length)
      return joined
    }
    this.left = append(this.left, left)
    this.right = this.channels === 2 ? append(this.right, right) : this.left
    this.inputSamples += left.length
    const end = final
      ? Math.round(this.inputSamples / this.ratio)
      : Math.max(0, Math.ceil((this.inputSamples - HALF_TAPS) / this.ratio))
    const outputLeft = new Float32Array(Math.max(0, end - this.outputSamples))
    const outputRight = this.channels === 2 ? new Float32Array(outputLeft.length) : outputLeft
    for (let index = 0; index < outputLeft.length; index++) {
      const position = this.outputSamples * this.ratio
      const center = Math.floor(position)
      const weights = this.filters[Math.round((position - center) * PHASES)]
      let l = 0
      let r = 0
      for (let tap = 0; tap < weights.length; tap++) {
        const source = Math.max(0, Math.min(this.left.length - 1, center + tap - HALF_TAPS + 1 - this.start))
        l += this.left[source] * weights[tap]
        if (this.channels === 2) r += this.right[source] * weights[tap]
      }
      outputLeft[index] = l
      if (this.channels === 2) outputRight[index] = r
      this.outputSamples++
    }
    const keepFrom = Math.max(this.start, Math.floor(this.outputSamples * this.ratio) - HALF_TAPS + 1)
    const drop = Math.min(this.left.length, keepFrom - this.start)
    this.left = this.left.subarray(drop)
    this.right = this.right.subarray(drop)
    this.start += drop
    return [outputLeft, outputRight]
  }
}

export class StreamingMp3Encoder {
  readonly sampleRate: number
  private encoder: Mp3Encoder
  private resampler: StreamingResampler | null
  private channels: number

  constructor(channels: number, sourceRate: number, kbps: number) {
    this.channels = channels
    this.sampleRate = mp3EncodingSampleRate(sourceRate, kbps, channels)
    this.encoder = new Mp3Encoder(channels, this.sampleRate, kbps)
    this.resampler = sourceRate === this.sampleRate ? null : new StreamingResampler(sourceRate, this.sampleRate, channels)
  }

  private encodePcm(left: Float32Array, right: Float32Array): Uint8Array {
    if (!left.length) return new Uint8Array(0)
    const toInt16 = (samples: Float32Array) => Int16Array.from(samples, sample =>
      Math.max(-32768, Math.min(32767, Math.round(sample * 32767))))
    return new Uint8Array(this.encoder.encodeBuffer(toInt16(left), this.channels === 2 ? toInt16(right) : undefined))
  }

  encode(left: Float32Array, right = left): Uint8Array {
    const pcm = this.resampler ? this.resampler.push(left, right) : [left, right]
    return this.encodePcm(pcm[0], pcm[1])
  }

  flush(): Uint8Array[] {
    const packets: Uint8Array[] = []
    if (this.resampler) {
      const pcm = this.resampler.push(new Float32Array(0), new Float32Array(0), true)
      const packet = this.encodePcm(pcm[0], pcm[1])
      if (packet.length) packets.push(packet)
    }
    const tail = this.encoder.flush()
    if (tail.length) packets.push(new Uint8Array(tail))
    return packets
  }
}
