import assert from "node:assert/strict"
import test from "node:test"
import { MPEGDecoder } from "mpg123-decoder"
import { StreamingMp3Encoder } from "./mp3Encoder.ts"
import { readFrameHeader } from "../app/(site)/compress-file/lib/mp3Info.ts"

function encode(channels, sourceRate, kbps, seconds = 4, chunks = [34607, 36864], frequency = 440) {
  const encoder = new StreamingMp3Encoder(channels, sourceRate, kbps)
  const left = Float32Array.from({ length: sourceRate * seconds }, (_, index) =>
    index < sourceRate / 4 ? 0 : Math.sin(index * 2 * Math.PI * frequency / sourceRate) * 0.5)
  const right = Float32Array.from(left, sample => sample * 0.5)
  const packets = []
  for (let start = 0, chunk = 0; start < left.length; chunk++) {
    const end = Math.min(left.length, start + chunks[chunk % chunks.length])
    packets.push(encoder.encode(left.subarray(start, end), right.subarray(start, end)))
    start = end
  }
  packets.push(...encoder.flush())
  return new Blob(packets, { type: "audio/mpeg" })
}

async function decode(blob) {
  const decoder = new MPEGDecoder()
  await decoder.ready
  try {
    const audio = decoder.decode(new Uint8Array(await blob.arrayBuffer()))
    assert.deepEqual(audio.errors, [])
    return audio
  } finally {
    decoder.free()
  }
}

function rms(samples) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
}

test("the encoder's configured rate matches its MP3 frames at every upload bitrate", () => {
  for (const channels of [1, 2]) {
    for (const rate of [8000, 16000, 32000, 44100, 48000, 96000]) {
      for (const kbps of [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]) {
        const encoder = new StreamingMp3Encoder(channels, rate, kbps)
        const packets = [encoder.encode(new Float32Array(256)), ...encoder.flush()]
        const first = packets.find(packet => packet.length > 0)
        const header = readFrameHeader(first, 0)
        assert.ok(header, `${channels} channels / ${rate} Hz / ${kbps} kbps has MP3 frames`)
        assert.equal(header.sampleRate, encoder.sampleRate, `${channels} channels / ${rate} Hz / ${kbps} kbps must not resample inside lamejs`)
      }
    }
  }
})

for (const [channels, sourceRate, kbps, targetRate] of [
  [2, 48000, 112, 44100],
  [2, 44100, 96, 32000],
  [2, 48000, 48, 22050],
  [1, 44100, 48, 32000],
  [2, 96000, 320, 48000],
]) {
  test(`${sourceRate} Hz / ${channels} channels at ${kbps} kbps keeps sound, timing, and channel levels`, async () => {
    const audio = await decode(encode(channels, sourceRate, kbps))
    assert.equal(audio.sampleRate, targetRate)
    assert.ok(Math.abs(audio.samplesDecoded / targetRate - 4) < 0.2)
    for (const second of [1, 2, 3]) {
      const left = rms(audio.channelData[0].subarray(targetRate * second, targetRate * (second + 0.5)))
      assert.ok(left > 0.27 && left < 0.4, `second ${second} RMS ${left} preserves the source level`)
      if (channels === 2) {
        const right = rms(audio.channelData[1].subarray(targetRate * second, targetRate * (second + 0.5)))
        assert.ok(right > 0.12 && right < 0.2, `second ${second} right RMS ${right} preserves stereo balance`)
      }
    }
  })
}

test("chunk boundaries do not change the resampled audio", async () => {
  const irregular = encode(2, 48000, 112, 2, [1, 16, 1003, 34607])
  const regular = encode(2, 48000, 112, 2, [1152 * 16])
  assert.deepEqual(new Uint8Array(await irregular.arrayBuffer()), new Uint8Array(await regular.arrayBuffer()))
})

test("downsampling filters frequencies above the new Nyquist limit", async () => {
  const audio = await decode(encode(2, 48000, 48, 2, [36864], 18000))
  const level = rms(audio.channelData[0].subarray(audio.sampleRate))
  assert.ok(level < 0.005, `high frequency alias RMS ${level} must be suppressed`)
})
