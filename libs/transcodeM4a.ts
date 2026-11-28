/// <reference types="dom-webcodecs" />
import { createFile, type MP4BoxBuffer, type Track } from "mp4box"
import { StreamingMp3Encoder } from "@/libs/mp3Encoder"

const READ_BYTES = 256 * 1024

// Parse the index first, then reread the audio in bounded pieces. In particular,
// M4As often put the moov index after the mdat audio, so don't retain the mdat.
export async function transcodeM4a(file: File, kbps: number, onProgress?: (value: number) => void): Promise<Blob> {
  if (typeof AudioDecoder === "undefined" || typeof EncodedAudioChunk === "undefined") {
    throw new Error(`Could not convert "${file.name}". This browser does not support streaming M4A decoding. Try a current Chromium-based browser or export the song as MP3.`)
  }
  const mp4 = createFile(false)
  let track: Track | undefined
  let parseError = ""
  mp4.onError = message => { parseError = String(message) }
  mp4.onReady = info => { track = info.audioTracks[0] }

  try {
    let offset = 0
    while (!track && offset < file.size) {
      const end = Math.min(offset + READ_BYTES, file.size)
      const buffer = await file.slice(offset, end).arrayBuffer() as MP4BoxBuffer
      buffer.fileStart = offset
      const next = mp4.appendBuffer(buffer)
      if (parseError) throw new Error(parseError)
      offset = next > offset ? next : end
    }
    if (!track?.audio || !track.codec.startsWith("mp4a.40.")) throw new Error("No supported AAC audio track was found.")
    if (track.audio.channel_count < 1 || track.audio.channel_count > 2) throw new Error("Only mono and stereo M4A audio can be converted.")
    const audioTrack = track
    let packets: Uint8Array[] = []
    const chunks: Blob[] = []
    let encoder: StreamingMp3Encoder | undefined
    let decoderError: Error | undefined
    let extracted = 0
    const decoder = new AudioDecoder({
      output: audio => {
        try {
          if (!encoder) encoder = new StreamingMp3Encoder(audio.numberOfChannels, audio.sampleRate, kbps)
          const left = new Float32Array(audio.numberOfFrames)
          audio.copyTo(left, { planeIndex: 0, format: "f32-planar" })
          const right = audio.numberOfChannels === 2 ? new Float32Array(audio.numberOfFrames) : left
          if (right !== left) audio.copyTo(right, { planeIndex: 1, format: "f32-planar" })
          const packet = encoder.encode(left, right)
          if (packet.length) packets.push(packet)
        } catch (error) {
          decoderError = error instanceof Error ? error : new Error(String(error))
        } finally { audio.close() }
      },
      error: error => { decoderError = error },
    })
    try {
      let configured = false
      mp4.onSamples = (id, _user, samples) => {
        for (const sample of samples) {
          if (!sample.data) throw new Error("The M4A contains missing audio data.")
          if (!configured) {
            // MPEG-4 DecoderSpecificInfo (tag 5) contains AudioSpecificConfig.
            const entry = sample.description as typeof sample.description & { esds?: { esd?: { findDescriptor: (tag: number) => { findDescriptor: (tag: number) => { data: Uint8Array } | undefined } | undefined } } }
            const config = entry.esds?.esd?.findDescriptor(4)?.findDescriptor(5)?.data
            if (!config) throw new Error("The M4A is missing its AAC decoder configuration.")
            decoder.configure({ codec: audioTrack.codec, sampleRate: audioTrack.audio!.sample_rate, numberOfChannels: audioTrack.audio!.channel_count, description: config })
            configured = true
          }
          decoder.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(sample.cts * 1_000_000 / sample.timescale), duration: Math.round(sample.duration * 1_000_000 / sample.timescale), data: sample.data }))
          extracted++
        }
        mp4.releaseUsedSamples(id, samples[samples.length - 1].number + 1)
      }
      mp4.setExtractionOptions(audioTrack.id, undefined, { nbSamples: 32 })
      offset = mp4.seek(0, false).offset
      mp4.start()
      while (offset < file.size && extracted < audioTrack.nb_samples) {
        const end = Math.min(offset + READ_BYTES, file.size)
        const buffer = await file.slice(offset, end).arrayBuffer() as MP4BoxBuffer
        buffer.fileStart = offset
        mp4.appendBuffer(buffer)
        if (parseError) throw new Error(parseError)
        if (configured) await decoder.flush()
        if (decoderError) throw decoderError
        if (packets.length) {
          chunks.push(new Blob(packets, { type: "audio/mpeg" }))
          packets = []
        }
        offset = end
        onProgress?.(Math.min(99, Math.max(1, Math.round(extracted / audioTrack.nb_samples * 100))))
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      if (extracted !== audioTrack.nb_samples || !configured || !encoder) throw new Error("The M4A audio is incomplete or unreadable.")
      packets.push(...(encoder as StreamingMp3Encoder).flush())
      if (packets.length) chunks.push(new Blob(packets, { type: "audio/mpeg" }))
      onProgress?.(100)
      return new Blob(chunks, { type: "audio/mpeg" })
    } finally {
      mp4.stop()
      if (decoder.state !== "closed") decoder.close()
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not convert "${file.name}". ${reason}`)
  }
}
