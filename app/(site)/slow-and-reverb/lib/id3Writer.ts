import { Id3Metadata } from "./id3AlbumArt"

/**
 * Builds a minimal ID3v2.3 tag (as bytes) from extracted metadata and returns it, ready to
 * prepend to raw MP3 frames. Writes TIT2/TPE1/TALB text frames (UTF-16 w/ BOM, so any
 * language survives) and an APIC cover-art frame. Returns an empty array if there's nothing
 * to write, so a metadata-free source produces a tag-free export (no wasted bytes).
 *
 * The @breezystack/lamejs encoder emits headerless MP3 frames, so the export otherwise loses
 * all the source metadata (cover art, title, artist, album). This restores it.
 */
export function buildId3Tag(meta: Id3Metadata): Uint8Array {
  const frames: Uint8Array[] = []

  if (meta.title) frames.push(textFrame("TIT2", meta.title))
  if (meta.artist) frames.push(textFrame("TPE1", meta.artist))
  if (meta.album) frames.push(textFrame("TALB", meta.album))
  if (meta.artData && meta.artData.length > 0) frames.push(apicFrame(meta.artData, meta.artMime))

  if (frames.length === 0) return new Uint8Array(0)

  const body = concat(frames)

  // ID3v2.3 header: "ID3", version 3.0, flags 0, synchsafe size.
  const header = new Uint8Array(10)
  header[0] = 0x49 // I
  header[1] = 0x44 // D
  header[2] = 0x33 // 3
  header[3] = 3 // version major
  header[4] = 0 // version minor
  header[5] = 0 // flags
  writeSynchsafe(header, 6, body.length)

  return concat([header, body])
}

/** A UTF-16 (with BOM) text frame: encoding byte 0x01, then the text as UTF-16LE + BOM. */
function textFrame(id: string, text: string): Uint8Array {
  const encoded = utf16leWithBom(text)
  const payload = new Uint8Array(1 + encoded.length)
  payload[0] = 0x01 // UTF-16 with BOM
  payload.set(encoded, 1)
  return frame(id, payload)
}

/** An APIC cover-art frame (picture type 0x03 = front cover), latin1 mime, empty description. */
function apicFrame(art: Uint8Array, mime: string): Uint8Array {
  const mimeBytes = latin1(mime)
  const payload = new Uint8Array(1 + mimeBytes.length + 1 + 1 + 1 + art.length)
  let p = 0
  payload[p++] = 0x00 // text encoding (latin1) for the description
  payload.set(mimeBytes, p); p += mimeBytes.length
  payload[p++] = 0x00 // mime null terminator
  payload[p++] = 0x03 // picture type: front cover
  payload[p++] = 0x00 // empty description + its null terminator
  payload.set(art, p)
  return frame("APIC", payload)
}

/** Wraps a frame payload with a 10-byte ID3v2.3 frame header (id, big-endian size, flags). */
function frame(id: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(10 + payload.length)
  out[0] = id.charCodeAt(0)
  out[1] = id.charCodeAt(1)
  out[2] = id.charCodeAt(2)
  out[3] = id.charCodeAt(3)
  // v2.3 frame size is a plain big-endian uint32 (NOT synchsafe).
  const size = payload.length
  out[4] = (size >>> 24) & 0xff
  out[5] = (size >>> 16) & 0xff
  out[6] = (size >>> 8) & 0xff
  out[7] = size & 0xff
  out[8] = 0 // flags
  out[9] = 0
  out.set(payload, 10)
  return out
}

/** Writes a 28-bit synchsafe integer (7 bits per byte) into buf at offset. */
function writeSynchsafe(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 21) & 0x7f
  buf[offset + 1] = (value >>> 14) & 0x7f
  buf[offset + 2] = (value >>> 7) & 0x7f
  buf[offset + 3] = value & 0x7f
}

function utf16leWithBom(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2)
  out[0] = 0xff // BOM (LE)
  out[1] = 0xfe
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    out[2 + i * 2] = code & 0xff
    out[2 + i * 2 + 1] = (code >>> 8) & 0xff
  }
  return out
}

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}
