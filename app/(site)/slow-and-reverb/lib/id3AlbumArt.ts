/** Album art bytes + mime, plus the common text tags, parsed from a source MP3's ID3v2 tag. */
export interface Id3Metadata {
  artData: Uint8Array | null
  artMime: string
  title: string | null
  artist: string | null
  album: string | null
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
    if (versionMajor !== 3 && versionMajor !== 4) return empty

    let offset = 10
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)
    const end = Math.min(10 + tagSize, bytes.length)

    const meta: Id3Metadata = { ...empty }

    while (offset + 10 < end) {
      const frameID = String.fromCharCode(
        bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
      )
      if (frameID === "\0\0\0\0") break

      let frameSize: number
      if (versionMajor === 4) {
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
      if (frameSize <= 0 || offset + 10 + frameSize > end) break

      const frameStart = offset + 10
      const frameEnd = frameStart + frameSize

      if ((frameID === "APIC" || frameID === "PIC") && !meta.artData) {
        let pos = frameStart
        pos++ // encoding byte
        let mimeEnd = pos
        while (mimeEnd < frameEnd && bytes[mimeEnd] !== 0) mimeEnd++
        const mime = new TextDecoder("ascii").decode(bytes.slice(pos, mimeEnd)) || "image/jpeg"
        pos = mimeEnd + 1
        if (frameID === "APIC") pos++ // picture type
        let descEnd = pos
        while (descEnd < frameEnd && bytes[descEnd] !== 0) descEnd++
        pos = descEnd + 1
        if (pos < frameEnd) {
          const imageData = bytes.slice(pos, frameEnd)
          if (imageData.length > 0) {
            meta.artData = imageData
            meta.artMime = mime
          }
        }
      } else if (frameID === "TIT2" && !meta.title) {
        meta.title = decodeTextFrame(bytes.slice(frameStart, frameEnd)) || null
      } else if (frameID === "TPE1" && !meta.artist) {
        meta.artist = decodeTextFrame(bytes.slice(frameStart, frameEnd)) || null
      } else if (frameID === "TALB" && !meta.album) {
        meta.album = decodeTextFrame(bytes.slice(frameStart, frameEnd)) || null
      }

      offset += 10 + frameSize
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
