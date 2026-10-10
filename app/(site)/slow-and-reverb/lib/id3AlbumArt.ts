/** Album art bytes + mime, plus the common text tags, parsed from a source MP3's ID3v2 tag. */
export interface Id3Metadata {
  artData: Uint8Array | null
  artMime: string
  title: string | null
  artist: string | null
  album: string | null
  albumArtist?: string | null
  year?: number | null
  genre?: string | null
  trackNumber?: number | null
  trackTotal?: number | null
}

/** Decodes an ID3 text-frame body (first byte = encoding) to a JS string. */
function decodeTextFrame(body: Uint8Array): string {
  if (body.length === 0) return ""
  const encoding = body[0]
  const payload = body.slice(1)
  let text: string
  if (encoding === 1 || encoding === 2) {
    // UTF-16 (with BOM) or UTF-16BE
    const label = encoding === 1 ? "utf-16" : "utf-16be"
    try {
      text = new TextDecoder(label).decode(payload)
    } catch {
      text = new TextDecoder("utf-8").decode(payload)
    }
  } else if (encoding === 3) {
    text = new TextDecoder("utf-8").decode(payload)
  } else {
    text = new TextDecoder("latin1").decode(payload)
  }
  // Strip trailing nulls / whitespace.
  return text.replace(/\0+$/g, "").trim()
}

function afterPictureDescription(bytes: Uint8Array, start: number, end: number, encoding: number): number {
  const utf16 = encoding === 1 || encoding === 2
  const width = utf16 ? 2 : 1
  for (let pos = start; pos + width <= end; pos += width) {
    if (bytes[pos] === 0 && (!utf16 || bytes[pos + 1] === 0)) return pos + width
  }
  return end
}

function removeUnsynchronization(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(bytes.length)
  let length = 0
  for (let i = 0; i < bytes.length; i++) {
    result[length++] = bytes[i]
    if (bytes[i] === 0xff && bytes[i + 1] === 0) i++
  }
  return result.slice(0, length)
}

/**
 * Extracts album art (as raw bytes) + title/artist/album from an MP3 ArrayBuffer's ID3v2
 * tag in a single pass. Returns empty/null fields for non-MP3, missing frames, or parse
 * failure. Never throws. Must be called on the *original* ArrayBuffer before
 * decodeAudioData (which detaches it).
 */
export function extractId3Metadata(data: ArrayBuffer): Id3Metadata {
  const empty: Id3Metadata = { artData: null, artMime: "image/jpeg", title: null, artist: null, album: null }
  try {
    const bytes = new Uint8Array(data)
    if (bytes.length < 10) return empty
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return empty

    const versionMajor = bytes[3]
    if (versionMajor !== 2 && versionMajor !== 3 && versionMajor !== 4) return empty

    let offset = 10
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)
    const end = Math.min(10 + tagSize, bytes.length)
    if (bytes[5] & 0x40 && versionMajor !== 2) {
      const extendedSize = versionMajor === 4
        ? ((bytes[10] & 0x7f) << 21) | ((bytes[11] & 0x7f) << 14) | ((bytes[12] & 0x7f) << 7) | (bytes[13] & 0x7f)
        : (bytes[10] << 24) | (bytes[11] << 16) | (bytes[12] << 8) | bytes[13]
      offset += versionMajor === 4 ? extendedSize : extendedSize + 4
    }

    const meta: Id3Metadata = { ...empty }

    const headerSize = versionMajor === 2 ? 6 : 10
    while (offset + headerSize <= end) {
      const frameID = versionMajor === 2
        ? String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2])
        : String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
      if (!frameID.trim() || frameID.includes("\0")) break

      let frameSize: number
      if (versionMajor === 2) {
        frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5]
      } else if (versionMajor === 4) {
        frameSize =
          ((bytes[offset + 4] & 0x7f) << 21) |
          ((bytes[offset + 5] & 0x7f) << 14) |
          ((bytes[offset + 6] & 0x7f) << 7) |
          (bytes[offset + 7] & 0x7f)
      } else {
        frameSize =
          (bytes[offset + 4] << 24) |
          (bytes[offset + 5] << 16) |
          (bytes[offset + 6] << 8) |
          bytes[offset + 7]
      }
      if (frameSize <= 0 || offset + headerSize + frameSize > end) break

      const frameStart = offset + headerSize
      const frameEnd = frameStart + frameSize

      if ((frameID === "APIC" || frameID === "PIC") && !meta.artData) {
        let pos = frameStart
        const encoding = bytes[pos++]
        let mime: string
        if (frameID === "PIC") {
          const format = new TextDecoder("ascii").decode(bytes.slice(pos, pos + 3)).toUpperCase()
          mime = format === "PNG" ? "image/png" : format === "JPG" ? "image/jpeg" : `image/${format.toLowerCase()}`
          pos += 3
        } else {
          let mimeEnd = pos
          while (mimeEnd < frameEnd && bytes[mimeEnd] !== 0) mimeEnd++
          mime = new TextDecoder("ascii").decode(bytes.slice(pos, mimeEnd)) || "image/jpeg"
          pos = mimeEnd + 1
        }
        pos++ // picture type
        pos = afterPictureDescription(bytes, pos, frameEnd, encoding)
        if (pos < frameEnd) {
          const imageData = (bytes[5] & 0x80) ? removeUnsynchronization(bytes.slice(pos, frameEnd)) : bytes.slice(pos, frameEnd)
          if (imageData.length > 0) {
            meta.artData = imageData
            meta.artMime = mime
          }
        }
      } else if ((frameID === "TIT2" || frameID === "TT2") && !meta.title) {
        meta.title = decodeTextFrame(bytes.slice(frameStart, frameEnd)) || null
      } else if ((frameID === "TPE1" || frameID === "TP1") && !meta.artist) {
        meta.artist = decodeTextFrame(bytes.slice(frameStart, frameEnd)) || null
      } else if ((frameID === "TALB" || frameID === "TAL") && !meta.album) {
        meta.album = decodeTextFrame(bytes.slice(frameStart, frameEnd)) || null
      }

      offset += headerSize + frameSize
    }

    return meta
  } catch {
    return empty
  }
}

/**
 * Extracts the first embedded album art (APIC/PIC frame) from an MP3 ArrayBuffer as a Blob.
 * Returns null for non-MP3, no art, or parse failure. Never throws.
 * Must be called on the *original* ArrayBuffer before decodeAudioData (which detaches it).
 *
 * Thin wrapper over extractId3Metadata — kept for the art-only callers.
 */
export function extractAlbumArt(data: ArrayBuffer): Blob | null {
  const { artData, artMime } = extractId3Metadata(data)
  if (!artData || artData.length === 0) return null
  return new Blob([artData], { type: artMime })
}
