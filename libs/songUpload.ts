export const MAX_SONG_UPLOAD_BYTES = 50 * 1024 * 1024
const UPLOAD_BITRATE_KBPS = 128
const SIZE_ERROR = "This recording still exceeds 50 MB at 128 kbps. Choose a shorter recording (about 54 minutes or less)."

/** Prepare the actual MP3 bytes before sending them to storage. */
export async function prepareSongUpload(
  file: File,
  duration: number,
  onProgress?: (progress: number) => void,
): Promise<File> {
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension !== "mp3" && extension !== "m4a") {
    throw new Error("Please select an MP3 or M4A file.")
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not determine song duration. Choose a valid MP3 or M4A file.")
  }

  onProgress?.(0)
  let needsEncoding = extension === "m4a" || file.size > MAX_SONG_UPLOAD_BYTES
  if (extension === "mp3") {
    const { parseBlob } = await import("music-metadata")
    const metadata = await parseBlob(file, { skipCovers: true })
    const bitrate = metadata.format.bitrate ?? (file.size * 8 / duration)
    needsEncoding ||= Math.round(bitrate) > UPLOAD_BITRATE_KBPS * 1000
  }

  if (!needsEncoding) {
    onProgress?.(100)
    return file.type === "audio/mpeg" ? file : new File([file], file.name, { type: "audio/mpeg" })
  }

  // Avoid decoding a huge recording that cannot fit even after compression.
  if (duration * UPLOAD_BITRATE_KBPS * 1000 / 8 > MAX_SONG_UPLOAD_BYTES) {
    throw new Error(SIZE_ERROR)
  }

  let buffer: AudioBuffer
  try {
    const context = new OfflineAudioContext(2, 1, 44100)
    buffer = await context.decodeAudioData(await file.arrayBuffer())
  } catch {
    throw new Error("Could not convert this audio file. It may be corrupted or use a codec your browser cannot read. Choose another MP3 or M4A file.")
  }

  const { encodeMp3 } = await import("@/app/(site)/slow-and-reverb/lib/encodeMp3")
  const audio = await encodeMp3(buffer, onProgress, undefined, UPLOAD_BITRATE_KBPS)
  if (audio.size > MAX_SONG_UPLOAD_BYTES) throw new Error(SIZE_ERROR)

  const name = file.name.replace(/\.(mp3|m4a)$/i, ".mp3")
  return new File([audio], name, { type: "audio/mpeg" })
}
