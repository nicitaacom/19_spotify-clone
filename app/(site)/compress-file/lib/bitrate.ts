const MPEG1_KBPS = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const MPEG2_KBPS = [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]

export function estimateMp3Bytes(durationSec: number, kbps: number): number {
  return Math.round((durationSec * kbps * 1000) / 8)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB"
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatBitrate(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0 kbps"
  return `${Math.round(bps / 1000)} kbps`
}

export function ladderForSampleRate(sampleRate: number): number[] {
  return sampleRate >= 32000 ? MPEG1_KBPS.slice() : MPEG2_KBPS.slice()
}

// Low to high. The last entry is the closest step under the source file.
export function bitrateChoices(input: {
  sourceBps: number
  durationSec: number
  sourceBytes: number
  sampleRate: number
}): number[] {
  const { sourceBps, durationSec, sourceBytes, sampleRate } = input
  if (!Number.isFinite(sourceBps) || sourceBps <= 0) return []
  if (!Number.isFinite(durationSec) || durationSec <= 0) return []
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) return []
  return ladderForSampleRate(sampleRate).filter(kbps => {
    // Half a kbps of header overhead must not count as a smaller bitrate.
    if (kbps * 1000 + 500 >= sourceBps) return false
    return estimateMp3Bytes(durationSec, kbps) < sourceBytes
  })
}

export function closestStepIndex(choices: number[]): number {
  return Math.max(0, choices.length - 1)
}
