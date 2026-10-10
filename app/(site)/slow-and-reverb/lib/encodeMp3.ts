import { Mp3Encoder } from "@breezystack/lamejs"

import type { Id3Metadata } from "./id3AlbumArt"
import { buildId3Tag } from "./id3Writer"

export async function encodeMp3(
  buffer: AudioBuffer,
  onProgress?: (pct: number) => void,
  metadata?: Id3Metadata,
  kbps = 320,
): Promise<Blob> {
  const sampleRate = buffer.sampleRate
  const numChannels = Math.min(2, buffer.numberOfChannels)

  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps)

  const left = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left

  const samples = left.length
  // Keep PCM conversion bounded instead of allocating another copy of the whole recording.
  const chunkSize = 1152 * 16
  const mp3Data: Uint8Array[] = []

  for (let i = 0; i < samples; i += chunkSize) {
    const length = Math.min(chunkSize, samples - i)
    const leftChunk = new Int16Array(length)
    const rightChunk = numChannels > 1 ? new Int16Array(length) : leftChunk
    for (let j = 0; j < length; j++) {
      leftChunk[j] = Math.max(-32768, Math.min(32767, Math.round(left[i + j] * 32767)))
      if (numChannels > 1) {
        rightChunk[j] = Math.max(-32768, Math.min(32767, Math.round(right[i + j] * 32767)))
      }
    }
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk)
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf))
    }
    if (onProgress) {
      const pct = Math.floor(((i + chunkSize) / samples) * 90)
      onProgress(Math.max(1, Math.min(90, pct)))
    }
    await new Promise((r) => setTimeout(r, 0))
  }

  const mp3buf = encoder.flush()
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf))
  }

  if (onProgress) onProgress(100)

  // Prepend an ID3v2 tag so the source's cover art + title/artist/album survive the export
  // (lamejs emits headerless MP3 frames). Empty tag when there's no metadata to carry.
  const id3 = metadata ? buildId3Tag(metadata) : new Uint8Array(0)
  const parts: BlobPart[] = id3.length > 0 ? [id3, ...mp3Data] : mp3Data

  const blob = new Blob(parts, { type: "audio/mpeg" })
  return blob
}
