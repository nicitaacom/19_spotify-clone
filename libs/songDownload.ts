import type { Song } from "@/types"
import type { Id3Metadata } from "@/app/(site)/slow-and-reverb/lib/id3AlbumArt"
import { buildId3Tag } from "@/app/(site)/slow-and-reverb/lib/id3Writer"
import { readHttpError } from "@/libs/errorText"
import { getSupabasePublicUrl } from "@/libs/helpers"
import { getMp3AudioBytes, getSongDownloadFilename } from "@/libs/mp3Tags"

async function getCoverMetadata(image: Blob): Promise<Pick<Id3Metadata, "artData" | "artMime">> {
  if (!image.size) throw new Error("The cover image download returned an empty file.")
  if (["image/jpeg", "image/png"].includes(image.type)) {
    return { artData: new Uint8Array(await image.arrayBuffer()), artMime: image.type }
  }
  // MP3 players commonly support JPEG and PNG covers. Convert other uploaded image formats.
  const imageUrl = URL.createObjectURL(image)
  try {
    const picture = new Image()
    picture.src = imageUrl
    await picture.decode()
    const scale = Math.min(1, 1000 / Math.max(picture.naturalWidth, picture.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("The browser could not create the song cover image.")
    context.fillStyle = "#111111"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(picture, 0, 0, canvas.width, canvas.height)
    const cover = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9))
    if (!cover) throw new Error("The browser could not convert the song cover to JPEG.")
    return { artData: new Uint8Array(await cover.arrayBuffer()), artMime: "image/jpeg" }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export async function downloadSong(song: Song, playlistTitle: string, onProgress: (progress: number) => void): Promise<void> {
  const response = await fetch(`/api/songs/${encodeURIComponent(song.id)}/play?stream=download`, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(await readHttpError(response, `Audio download for song ${song.id}`))
  }
  const audioFile = await response.blob()
  if (!audioFile.size) throw new Error("The audio download returned an empty file.")
  onProgress(20)

  const { parseBlob, selectCover } = await import("music-metadata")
  const source = await parseBlob(audioFile).catch(() => null)
  const sourceCover = selectCover(source?.common.picture)
  const metadata: Id3Metadata = {
    title: song.title,
    artist: song.author,
    album: source?.common.album || playlistTitle,
    albumArtist: source?.common.albumartist,
    year: source?.common.year,
    genre: source?.common.genre?.join(" / "),
    trackNumber: source?.common.track.no,
    trackTotal: source?.common.track.of,
    artData: null,
    artMime: "image/jpeg",
  }
  const coverUrl = getSupabasePublicUrl("images", song.image_path)
  try {
    if (coverUrl) {
      const coverResponse = await fetch(coverUrl)
      if (!coverResponse.ok) throw new Error(await readHttpError(coverResponse, `Cover image for song ${song.id}`))
      Object.assign(metadata, await getCoverMetadata(await coverResponse.blob()))
    } else if (sourceCover) {
      Object.assign(metadata, await getCoverMetadata(new Blob([sourceCover.data], { type: sourceCover.format })))
    }
  } catch (error) {
    if (!sourceCover) throw error
    Object.assign(metadata, await getCoverMetadata(new Blob([sourceCover.data], { type: sourceCover.format })))
  }
  onProgress(30)

  let mp3File: Blob
  if (song.song_path.toLowerCase().endsWith(".m4a")) {
    const { encodeMp3 } = await import("@/app/(site)/slow-and-reverb/lib/encodeMp3")
    // Offline decoding leaves the main player's AudioContext and playback untouched.
    const context = new OfflineAudioContext(2, 1, 44100)
    const buffer = await context.decodeAudioData(await audioFile.arrayBuffer())
    mp3File = await encodeMp3(buffer, progress => onProgress(30 + Math.round(progress * 0.7)), metadata)
  } else {
    const audioBytes = getMp3AudioBytes(new Uint8Array(await audioFile.arrayBuffer()))
    mp3File = new Blob([buildId3Tag(metadata), audioBytes], { type: "audio/mpeg" })
  }

  const downloadUrl = URL.createObjectURL(mp3File)
  const anchor = document.createElement("a")
  anchor.href = downloadUrl
  anchor.download = getSongDownloadFilename(song.author, song.title)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser time to start reading the file before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000)
}
