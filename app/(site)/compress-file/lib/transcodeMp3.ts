import { Mp3Encoder } from "@breezystack/lamejs"
import { MPEGDecoder, MPEGDecodedAudio } from "mpg123-decoder"

import type { Id3Metadata } from "../../slow-and-reverb/lib/id3AlbumArt"
import { buildId3Tag } from "../../slow-and-reverb/lib/id3Writer"
import { namedError } from "./describeError"
import { readFrameHeader, readMp3Info } from "./mp3Info"

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length === 0) return right
  if (right.length === 0) return left
  const joined = new Uint8Array(left.length + right.length)
  joined.set(left, 0)
  joined.set(right, left.length)
  return joined
}

function toInt16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index++) {
    const scaled = Math.max(-1, Math.min(1, samples[index])) * 32767
    pcm[index] = Math.round(scaled)
  }
  return pcm
}

export async function transcodeMp3(
  file: File,
  kbps: number,
  metadata: Id3Metadata | null,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer())
  const info = readMp3Info(head, file.size)
  if (!info) {
    throw namedError(
      "EncodingError",
      `readMp3Info found no MPEG frame in the first ${head.length} bytes of "${file.name}" (${file.size} bytes).`,
    )
  }

  const decoder = new MPEGDecoder()
  await decoder.ready
  const encoded: Uint8Array[] = []
  const state: { encoder: Mp3Encoder | null } = { encoder: null }
  let firstDecoderMessage: string | null = null

  const pushDecoded = (decoded: MPEGDecodedAudio) => {
    if (decoded.errors.length > 0 && !firstDecoderMessage) firstDecoderMessage = decoded.errors[0].message
    if (decoded.samplesDecoded <= 0 || decoded.channelData.length === 0) return
    const channels = Math.min(2, decoded.channelData.length)
    if (!state.encoder) state.encoder = new Mp3Encoder(channels, decoded.sampleRate, kbps)
    const left = toInt16(decoded.channelData[0])
    const packet = channels > 1
      ? state.encoder.encodeBuffer(left, toInt16(decoded.channelData[1]))
      : state.encoder.encodeBuffer(left)
    if (packet.length > 0) encoded.push(new Uint8Array(packet))
  }

  try {
    let pending = new Uint8Array(0)
    let offset = info.audioStart
    const total = Math.max(1, file.size - info.audioStart)
    const batch: Uint8Array[] = []
    const flushBatch = () => {
      if (batch.length === 0) return
      pushDecoded(decoder.decodeFrames(batch.splice(0, batch.length)))
    }

    while (offset < file.size) {
      const end = Math.min(file.size, offset + 256 * 1024)
      const piece = new Uint8Array(await file.slice(offset, end).arrayBuffer())
      offset = end
      const data = concatBytes(pending, piece)
      let cursor = 0
      while (cursor + 4 <= data.length) {
        const header = readFrameHeader(data, cursor)
        if (!header) {
          cursor += 1
          continue
        }
        if (cursor + header.frameBytes > data.length) break
        batch.push(data.slice(cursor, cursor + header.frameBytes))
        cursor += header.frameBytes
        if (batch.length >= 32) flushBatch()
      }
      pending = new Uint8Array(data.subarray(cursor))
      flushBatch()
      onProgress?.(Math.max(1, Math.min(99, Math.round(((offset - info.audioStart) / total) * 100))))
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } finally {
    try { decoder.free() } catch { /* already closed */ }
  }

  const encoder = state.encoder
  if (!encoder || encoded.length === 0) {
    const detail = firstDecoderMessage ? ` mpg123-decoder: ${firstDecoderMessage}` : ""
    throw namedError(
      "EncodingError",
      `mpg123-decoder produced no PCM for "${file.name}" (${file.size} bytes) at ${kbps} kbps.${detail}`,
    )
  }

  const tail = encoder.flush()
  if (tail.length > 0) encoded.push(new Uint8Array(tail))
  const id3 = metadata ? buildId3Tag(metadata) : new Uint8Array(0)
  const parts: BlobPart[] = id3.length > 0 ? [id3, ...encoded] : encoded
  onProgress?.(100)
  return new Blob(parts, { type: "audio/mpeg" })
}
