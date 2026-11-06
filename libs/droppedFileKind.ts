import { IMAGE_MIME_BY_EXTENSION } from "./imageFiles"

const SONG_EXTENSIONS = ["mp3", "m4a", "wav", "flac", "ogg", "oga", "opus", "aac", "webm", "aif", "aiff"]

export const SONG_FILE_ACCEPT = [
  ".mp3", ".m4a", ".wav", ".flac", ".ogg", ".oga", ".opus", ".aac", ".webm", ".aif", ".aiff",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/flac", "audio/ogg", "audio/aac", "audio/webm", "audio/aiff", "audio/x-aiff",
].join(",")

export type DroppedKind = "song" | "image"

export type NamedFile = { name: string; type: string }

const fileExtension = (name: string) => {
  const base = name.split(/[/\\]/).pop() ?? ""
  const dot = base.lastIndexOf(".")
  if (dot <= 0) return ""
  return base.slice(dot + 1).toLowerCase()
}

const mimeType = (mime: string) => mime.split(";")[0]?.trim().toLowerCase() ?? ""

// A desktop drop often arrives with an empty type. The cover name still counts.
export const isCoverImageFile = (name: string, mime: string) => {
  const expected = IMAGE_MIME_BY_EXTENSION[fileExtension(name)]
  if (!expected) return false
  const type = mimeType(mime)
  if (!type || type === "application/octet-stream") return true
  return type === expected
}

const isImageNameOrType = (name: string, mime: string) => {
  if (IMAGE_MIME_BY_EXTENSION[fileExtension(name)]) return true
  return mimeType(mime).startsWith("image/")
}

export const isSongFile = (name: string, mime: string) => {
  if (isImageNameOrType(name, mime)) return false
  const type = mimeType(mime)
  if (type.startsWith("video/")) return false
  return SONG_EXTENSIONS.includes(fileExtension(name))
}

export const songInputError = (name: string, mime: string) => {
  if (isImageNameOrType(name, mime)) {
    return `"${name}" is an image. Choose it in Select an image. The song file is audio, and it is stored as MP3.`
  }
  if (!isSongFile(name, mime)) {
    return `"${name}" is not an audio file. Pick an MP3, WAV, M4A, FLAC, or OGG file. It is stored as MP3.`
  }
  return ""
}

export const droppedFileKind = (name: string, mime: string): DroppedKind | null => {
  if (isCoverImageFile(name, mime)) return "image"
  if (isImageNameOrType(name, mime)) return null
  if (isSongFile(name, mime)) return "song"
  return null
}

// The last song and the last cover in one drop are the ones kept.
export const splitDroppedFiles = <T extends NamedFile>(files: T[]) => {
  let song: T | null = null
  let image: T | null = null
  const skipped: T[] = []
  for (const file of files) {
    const kind = droppedFileKind(file.name, file.type)
    if (kind === "song") song = file
    else if (kind === "image") image = file
    else skipped.push(file)
  }
  return { song, image, skipped }
}

// Empty or generic type on a known cover name becomes that image type before upload.
export const coverTypeToStamp = (name: string, mime: string) => {
  if (!isCoverImageFile(name, mime)) return ""
  const type = mimeType(mime)
  if (type && type !== "application/octet-stream") return ""
  return IMAGE_MIME_BY_EXTENSION[fileExtension(name)] ?? ""
}
