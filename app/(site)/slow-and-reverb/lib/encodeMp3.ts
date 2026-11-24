import { StreamingMp3Encoder } from "@/libs/mp3Encoder"

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

  const encoder = new StreamingMp3Encoder(numChannels, sampleRate, kbps)

  const left = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left

  const samples = left.length
  // Keep PCM conversion bounded instead of allocating another copy of the whole recording.
  const chunkSize = 1152 * 16
  const mp3Data: Uint8Array[] = []

  for (let i = 0; i < samples; i += chunkSize) {
    const mp3buf = encoder.encode(left.subarray(i, i + chunkSize), right.subarray(i, i + chunkSize))
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf))
    }
    if (onProgress) {
      const pct = Math.floor(((i + chunkSize) / samples) * 90)
      onProgress(Math.max(1, Math.min(90, pct)))
    }
    await new Promise((r) => setTimeout(r, 0))
  }

  mp3Data.push(...encoder.flush())

  if (onProgress) onProgress(100)

  // Prepend an ID3v2 tag so the source's cover art + title/artist/album survive the export
  // (lamejs emits headerless MP3 frames). Empty tag when there's no metadata to carry.
  const id3 = metadata ? buildId3Tag(metadata) : new Uint8Array(0)
  const parts: BlobPart[] = id3.length > 0 ? [id3, ...mp3Data] : mp3Data

  const blob = new Blob(parts, { type: "audio/mpeg" })
  return blob
}
