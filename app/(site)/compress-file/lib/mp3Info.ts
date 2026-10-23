const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const MPEG2_L3_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const MPEG1_RATES = [44100, 48000, 32000]
const MPEG2_RATES = [22050, 24000, 16000]
const MPEG25_RATES = [11025, 12000, 8000]

// A two hour stereo recording expands past 2 GB. Chrome rejects that decode.
export const MAX_PCM_BYTES = 256 * 1024 * 1024

export interface FrameHeader {
  frameBytes: number
  sampleRate: number
  channels: number
  bitrateBps: number
  samplesPerFrame: number
}

export interface Mp3Info extends FrameHeader {
  durationSec: number
  audioStart: number
}

export function pcmBytes(durationSec: number, sampleRate: number, channels: number): number {
  return durationSec * sampleRate * channels * 4
}

export function id3AudioStart(bytes: Uint8Array): number {
  if (bytes.length < 10) return 0
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0
  const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  const footer = bytes[5] & 0x10 ? 10 : 0
  return 10 + size + footer
}

export function readFrameHeader(bytes: Uint8Array, offset: number): FrameHeader | null {
  if (offset < 0 || offset + 4 > bytes.length) return null
  const first = bytes[offset]
  const second = bytes[offset + 1]
  const third = bytes[offset + 2]
  const fourth = bytes[offset + 3]
  if (first !== 0xff || (second & 0xe0) !== 0xe0) return null
  const version = (second >> 3) & 3
  const layer = (second >> 1) & 3
  if (version === 1 || layer !== 1) return null
  const bitrateIndex = (third >> 4) & 0xf
  const sampleIndex = (third >> 2) & 3
  const padding = (third >> 1) & 1
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return null
  const mpeg1 = version === 3
  const bitrateKbps = (mpeg1 ? MPEG1_L3_KBPS : MPEG2_L3_KBPS)[bitrateIndex]
  const sampleRate = (mpeg1 ? MPEG1_RATES : version === 2 ? MPEG2_RATES : MPEG25_RATES)[sampleIndex]
  if (!bitrateKbps || !sampleRate) return null
  const channels = ((fourth >> 6) & 3) === 3 ? 1 : 2
  const samplesPerFrame = mpeg1 ? 1152 : 576
  const frameBytes = Math.floor((samplesPerFrame / 8) * bitrateKbps * 1000 / sampleRate) + padding
  if (frameBytes < 4) return null
  return { frameBytes, sampleRate, channels, bitrateBps: bitrateKbps * 1000, samplesPerFrame }
}

function xingFrameCount(bytes: Uint8Array, offset: number, header: FrameHeader): number | null {
  const mpeg1 = header.samplesPerFrame === 1152
  const side = mpeg1 ? (header.channels === 1 ? 17 : 32) : (header.channels === 1 ? 9 : 17)
  const marker = offset + 4 + side
  if (marker + 16 > bytes.length) return null
  const tag = String.fromCharCode(bytes[marker], bytes[marker + 1], bytes[marker + 2], bytes[marker + 3])
  if (tag !== "Xing" && tag !== "Info") return null
  const flags = bytes[marker + 4] * 0x1000000 + (bytes[marker + 5] << 16) + (bytes[marker + 6] << 8) + bytes[marker + 7]
  if ((flags & 1) === 0) return null
  return bytes[marker + 8] * 0x1000000 + (bytes[marker + 9] << 16) + (bytes[marker + 10] << 8) + bytes[marker + 11]
}

export function readMp3Info(bytes: Uint8Array, fileBytes: number): Mp3Info | null {
  const tagEnd = id3AudioStart(bytes)
  if (tagEnd > bytes.length) return null
  const scanEnd = Math.min(bytes.length - 4, tagEnd + 65536)
  for (let offset = tagEnd; offset <= scanEnd; offset++) {
    const header = readFrameHeader(bytes, offset)
    if (!header) continue
    const frames = xingFrameCount(bytes, offset, header)
    const audioBytes = Math.max(0, fileBytes - offset)
    const durationSec = frames
      ? (frames * header.samplesPerFrame) / header.sampleRate
      : (audioBytes * 8) / header.bitrateBps
    const bitrateBps = frames ? (audioBytes * 8) / durationSec : header.bitrateBps
    if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(bitrateBps) || bitrateBps <= 0) return null
    return { ...header, bitrateBps, durationSec, audioStart: offset }
  }
  return null
}
