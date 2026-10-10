/** Removes existing ID3 tags before adding the current song metadata. Audio bytes stay intact. */
export function getMp3AudioBytes(data: Uint8Array): Uint8Array {
  let start = 0
  let end = data.length
  while (start + 10 <= end && data[start] === 0x49 && data[start + 1] === 0x44 && data[start + 2] === 0x33) {
    const version = data[start + 3]
    const sizeBytes = data.subarray(start + 6, start + 10)
    if (![2, 3, 4].includes(version) || sizeBytes.some(value => value > 0x7f)) {
      throw new Error("The MP3 has an invalid ID3 header.")
    }
    const size = (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3]
    const footerSize = version === 4 && (data[start + 5] & 0x10) ? 10 : 0
    start += 10 + size + footerSize
    if (start > end) throw new Error("The MP3 has an incomplete ID3 tag.")
  }
  if (end - start >= 128 && data[end - 128] === 0x54 && data[end - 127] === 0x41 && data[end - 126] === 0x47) end -= 128
  if (start >= end) throw new Error("The MP3 contains no audio data.")
  return data.subarray(start, end)
}

export function getSongDownloadFilename(artist: string, title: string): string {
  const name = Array.from(`${artist} - ${title}`)
    .filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join("")
    .replace(/[<>:"/\\|?*]/g, "_")
    .trim()
    .slice(0, 180)
    .replace(/[. ]+$/g, "")
  return `${name || "Song"}.mp3`
}
