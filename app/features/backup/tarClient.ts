// Pure tar (.tar) builders/parsers + a browser-native gzip. Everything here is either pure
// `Buffer` math (works in the browser via Next's polyfill) or uses the built-in Web
// `CompressionStream` API — deliberately NO Node `zlib` import, so this module is safe to pull
// into the client bundle. The server's Node `zlib` helpers live in ./backupTables and re-export
// these pure parts so existing server imports keep working unchanged.

// Tables backed up in FK-safe order
export const BACKUP_TABLES = ["19_songs", "19_liked_songs", "19_playlists", "19_playlist_songs"] as const
export type BackupTable = (typeof BACKUP_TABLES)[number]

// Storage buckets
export const BACKUP_BUCKETS = ["songs", "images"] as const
export type BackupBucket = (typeof BACKUP_BUCKETS)[number]

export interface BackupFileRef {
  bucket: BackupBucket
  path: string
  size: number
  contentType: string
}

// ── tar helpers ─────────────────────────────────────────────────────────────

function encodeOctal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0"
}

function computeChecksum(header: Buffer): number {
  let sum = 0
  for (let i = 0; i < 512; i++) sum += header[i]
  return sum
}

function buildTarHeader(name: string, size: number, type: "0" | "5" = "0"): Buffer {
  const header = Buffer.alloc(512, 0)

  // Encode name (up to 100 bytes). For long names use GNU long-name extension.
  const nameBytes = Buffer.from(name.slice(0, 100), "utf8")
  nameBytes.copy(header, 0)

  // Permissions
  Buffer.from(encodeOctal(type === "5" ? 0o755 : 0o644, 8)).copy(header, 100)
  // uid / gid
  Buffer.from(encodeOctal(0, 8)).copy(header, 108)
  Buffer.from(encodeOctal(0, 8)).copy(header, 116)
  // Size
  Buffer.from(encodeOctal(size, 12)).copy(header, 124)
  // Modification time
  Buffer.from(encodeOctal(Math.floor(Date.now() / 1000), 12)).copy(header, 136)
  // Checksum placeholder
  Buffer.from("        ").copy(header, 148)
  // Type flag: 0=file, 5=directory
  header[156] = type.charCodeAt(0)
  // UStar magic
  Buffer.from("ustar  \0").copy(header, 257)

  const checksum = computeChecksum(header)
  Buffer.from(encodeOctal(checksum, 8)).copy(header, 148)

  return header
}

/** Build a GNU long-name header so paths > 100 chars work */
function buildLongNameEntry(name: string): Buffer[] {
  const nameData = Buffer.from(name + "\0", "utf8")
  const padding = (512 - (nameData.length % 512)) % 512
  const header = Buffer.alloc(512, 0)
  Buffer.from("././@LongLink").copy(header, 0)
  Buffer.from(encodeOctal(0, 8)).copy(header, 100)
  Buffer.from(encodeOctal(0, 8)).copy(header, 108)
  Buffer.from(encodeOctal(0, 8)).copy(header, 116)
  Buffer.from(encodeOctal(nameData.length, 12)).copy(header, 124)
  Buffer.from(encodeOctal(Math.floor(Date.now() / 1000), 12)).copy(header, 136)
  Buffer.from("        ").copy(header, 148)
  header[156] = "L".charCodeAt(0)
  Buffer.from("ustar  \0").copy(header, 257)
  const checksum = computeChecksum(header)
  Buffer.from(encodeOctal(checksum, 8)).copy(header, 148)
  return [header, nameData, Buffer.alloc(padding, 0)]
}

export function addTarEntry(chunks: Buffer[], name: string, data: Buffer): void {
  if (name.length > 100) {
    buildLongNameEntry(name).forEach(c => chunks.push(c))
  }
  chunks.push(buildTarHeader(name, data.length))
  chunks.push(data)
  const pad = (512 - (data.length % 512)) % 512
  if (pad > 0) chunks.push(Buffer.alloc(pad, 0))
}

export function finalizeTar(chunks: Buffer[]): Buffer {
  // Two 512-byte zero blocks mark end of archive
  chunks.push(Buffer.alloc(1024, 0))
  return Buffer.concat(chunks)
}

/** Parse a .tar (already decompressed) into named entries */
export function parseTar(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>()
  let offset = 0
  let pendingLongName: string | null = null

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    if (header.every(b => b === 0)) break

    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0/g, "")
    const typeFlag = String.fromCharCode(header[156])
    const sizeStr = header.subarray(124, 136).toString("utf8").replace(/\0/g, "").trim()
    const size = parseInt(sizeStr, 8) || 0

    offset += 512
    const dataEnd = offset + size
    const paddedSize = Math.ceil(size / 512) * 512

    if (typeFlag === "L") {
      // GNU long-name extension
      pendingLongName = buf.subarray(offset, offset + size).toString("utf8").replace(/\0/g, "")
    } else if (typeFlag === "0" || typeFlag === "\0") {
      const name = pendingLongName ?? rawName
      pendingLongName = null
      entries.set(name, buf.subarray(offset, dataEnd))
    } else {
      pendingLongName = null
    }

    offset += paddedSize
  }

  return entries
}

// ── browser gzip ─────────────────────────────────────────────────────────────

/**
 * Gzip a buffer in the browser using the built-in CompressionStream Web API (zero deps).
 * Output is a standard gzip stream, so the server's Node `gunzipBuffer` decompresses it
 * identically — the archive format is byte-compatible with server-built archives.
 */
export async function gzipBufferClient(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip")
  const stream = new Response(input).body!.pipeThrough(cs)
  const compressed = await new Response(stream).arrayBuffer()
  return new Uint8Array(compressed)
}

/**
 * Decompress a gzip buffer in the browser using the built-in DecompressionStream Web API (zero
 * deps). The counterpart to gzipBufferClient — reads .tar.gz archives client-side so archive
 * bytes never reach a server function (see dev_readme-backup.md for why).
 */
export async function gunzipBufferClient(input: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip")
  const stream = new Response(input).body!.pipeThrough(ds)
  const decompressed = await new Response(stream).arrayBuffer()
  return new Uint8Array(decompressed)
}
