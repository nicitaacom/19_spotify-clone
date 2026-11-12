export const MAX_SONG_UPLOAD_BYTES = 50 * 1024 * 1024
// Stay under the storage cap. A file that is only slightly over is cut to this size, not to half.
const UPLOAD_FIT_BYTES = 49 * 1024 * 1024
const PREFERRED_KBPS = 128
// MPEG-1 steps above 128. A file over the cap keeps the highest step its own bitrate allows that still fits.
const ABOVE_PREFERRED_KBPS = [320, 256, 224, 192, 160]
const FITTING_KBPS = [128, 112, 96, 80, 64, 56, 48, 40, 32, 24, 16, 8]
const ACCEPTED_AUDIO_EXTENSIONS = ["mp3", "m4a", "wav", "flac", "ogg", "oga", "opus", "aac", "webm", "aif", "aiff"]
const MAX_PCM_BYTES = 256 * 1024 * 1024

export function uploadBitrateKbps(durationSec: number, sourceBytes = 0, sourceBitrate = 0): number {
  if (sourceBytes > 0 && sourceBitrate > 0) {
    if (sourceBytes <= MAX_SONG_UPLOAD_BYTES) return PREFERRED_KBPS
    for (const kbps of [...ABOVE_PREFERRED_KBPS, ...FITTING_KBPS]) {
      if (kbps * 1000 > sourceBitrate) continue
      if (sourceBytes * (kbps * 1000) / sourceBitrate <= UPLOAD_FIT_BYTES) return kbps
    }
    return 8
  }
  for (const kbps of FITTING_KBPS) {
    if (durationSec * kbps * 1000 / 8 <= UPLOAD_FIT_BYTES) return kbps
  }
  return 8
}

/** Prepare the actual MP3 bytes before sending them to storage. */
export async function prepareSongUpload(
  file: File,
  duration: number,
  onProgress?: (progress: number) => void,
  onCompress?: (fromBytes: number, toBytes: number) => void,
): Promise<File> {
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (!extension || !ACCEPTED_AUDIO_EXTENSIONS.includes(extension)) {
    throw new Error(`"${file.name}" is not an audio file.`)
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine the duration of "${file.name}".`)
  }

  onProgress?.(0)
  let sourceBitrate = 0
  let needsEncoding = extension !== "mp3" || file.size > MAX_SONG_UPLOAD_BYTES
  if (extension === "mp3") {
    const { parseBlob } = await import("music-metadata")
    const metadata = await parseBlob(file, { skipCovers: true })
    const reportedBitrate = metadata.format.bitrate
    sourceBitrate = reportedBitrate && reportedBitrate > 0 ? reportedBitrate : file.size * 8 / duration
  }
  const kbps = uploadBitrateKbps(duration, extension === "mp3" ? file.size : 0, sourceBitrate)
  if (sourceBitrate > 0 && Math.round(sourceBitrate) > kbps * 1000) needsEncoding = true

  if (!needsEncoding && kbps === PREFERRED_KBPS) {
    onProgress?.(100)
    return file.type === "audio/mpeg" ? file : new File([file], file.name, { type: "audio/mpeg" })
  }
  if (!needsEncoding && sourceBitrate > 0 && sourceBitrate <= kbps * 1000 && file.size <= MAX_SONG_UPLOAD_BYTES) {
    onProgress?.(100)
    return file.type === "audio/mpeg" ? file : new File([file], file.name, { type: "audio/mpeg" })
  }

  onCompress?.(file.size, sourceBitrate > 0 ? file.size * kbps * 1000 / sourceBitrate : duration * kbps * 1000 / 8)
  const baseName = file.name.replace(/\.[^.]+$/, "") || "song"
  const tooLargeToDecode = duration * 44100 * 2 * 4 > MAX_PCM_BYTES
  if (extension === "mp3" && tooLargeToDecode) {
    const { transcodeMp3 } = await import("@/app/(site)/compress-file/lib/transcodeMp3")
    const audio = await transcodeMp3(file, kbps, null, onProgress)
    if (audio.size > MAX_SONG_UPLOAD_BYTES) {
      throw new Error(`"${file.name}" encoded at ${kbps} kbps is ${audio.size} bytes, over the ${MAX_SONG_UPLOAD_BYTES} byte storage cap.`)
    }
    return new File([audio], `${baseName}.mp3`, { type: "audio/mpeg" })
  }

  let buffer: AudioBuffer
  try {
    const context = new OfflineAudioContext(2, 1, 44100)
    buffer = await context.decodeAudioData(await file.arrayBuffer())
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : `Error: ${String(error)}`
    throw new Error(`Could not convert "${file.name}". ${reason}`)
  }

  const { encodeMp3 } = await import("@/app/(site)/slow-and-reverb/lib/encodeMp3")
  const audio = await encodeMp3(buffer, onProgress, undefined, kbps)
  if (audio.size > MAX_SONG_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" encoded at ${kbps} kbps is ${audio.size} bytes, over the ${MAX_SONG_UPLOAD_BYTES} byte storage cap.`)
  }
  return new File([audio], `${baseName}.mp3`, { type: "audio/mpeg" })
}
