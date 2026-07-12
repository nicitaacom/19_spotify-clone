import { Mp3Encoder } from "@breezystack/lamejs"

import { Id3Metadata } from "./id3AlbumArt"
import { buildId3Tag } from "./id3Writer"

export async function encodeMp3(
  buffer: AudioBuffer,
  onProgress?: (pct: number) => void,
  metadata?: Id3Metadata,
): Promise<Blob> {
  const sampleRate = buffer.sampleRate
  const numChannels = Math.min(2, buffer.numberOfChannels)
  const kbps = 320

  const encoder = new Mp3Encoder(numChannels, sampleRate, kbps)

  const left = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left

  const samples = left.length
  const leftI16 = new Int16Array(samples)
  const rightI16 = new Int16Array(samples)

  for (let i = 0; i < samples; i++) {
    leftI16[i] = Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767)))
    rightI16[i] = Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767)))
  }

  const chunkSize = 1152 * 64
  const mp3Data: Uint8Array[] = []

  for (let i = 0; i < samples; i += chunkSize) {
    const leftChunk = leftI16.subarray(i, i + chunkSize)
    const rightChunk = rightI16.subarray(i, i + chunkSize)
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

  const blob = new Blob(parts, { type: "audio/mp3" })
  return blob
}
