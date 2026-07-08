/**
 * Extracts the first embedded album art (APIC/PIC frame) from an MP3 ArrayBuffer as a Blob.
 * Returns null for non-MP3, no art, or parse failure. Never throws.
 * Must be called on the *original* ArrayBuffer before decodeAudioData (which detaches it).
 */
export function extractAlbumArt(data: ArrayBuffer): Blob | null {
  try {
    const bytes = new Uint8Array(data)
    if (bytes.length < 10) return null

    // "ID3" magic
    if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null

    const versionMajor = bytes[3]
    if (versionMajor !== 3 && versionMajor !== 4) return null // v2.3 / v2.4 only for simplicity

    // Skip flags (byte 5), read synchsafe size (bytes 6-9)
    let offset = 10
    const tagSize =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f)

    const end = Math.min(10 + tagSize, bytes.length)

    while (offset + 10 < end) {
      const frameID =
        String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])

      if (frameID === '\0\0\0\0') break

      // Frame size (v2.3 = big-endian, v2.4 = synchsafe)
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

      if (frameID === 'APIC' || frameID === 'PIC') {
        let pos = offset + 10
        const encoding = bytes[pos++]

        let mimeEnd = pos
        while (mimeEnd < offset + 10 + frameSize && bytes[mimeEnd] !== 0) mimeEnd++
        const mime = new TextDecoder('ascii').decode(bytes.slice(pos, mimeEnd)) || 'image/jpeg'
        pos = mimeEnd + 1 // skip null

        if (frameID === 'APIC') {
          pos++ // picture type (1 byte)
        }

        // description (null-terminated)
        let descEnd = pos
        while (descEnd < offset + 10 + frameSize && bytes[descEnd] !== 0) descEnd++
        pos = descEnd + 1

        if (pos >= offset + 10 + frameSize) return null

        const imageData = bytes.slice(pos, offset + 10 + frameSize)
        if (imageData.length === 0) return null

        return new Blob([imageData], { type: mime })
      }

      offset += 10 + frameSize
    }

    return null
  } catch {
    return null
  }
}
