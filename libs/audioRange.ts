export type AudioByteRange = { start: number; end: number }

export const parseAudioByteRange = (header: string, size: number): AudioByteRange | null => {
  if (!Number.isSafeInteger(size) || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return null

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }

  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

// Supabase's signed URL can respond with the whole object even to a Range request.
// Discard bytes as they arrive, without buffering the entire audio file in memory.
export const sliceAudioStream = (stream: ReadableStream<Uint8Array>, skip: number, length: number) => {
  const reader = stream.getReader()
  let read = 0
  let sent = 0

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (sent < length) {
        const { done, value } = await reader.read()
        if (done) {
          controller.error(new Error("Audio ended before the requested range was available."))
          return
        }

        const start = Math.max(0, skip - read)
        const available = Math.min(value.byteLength - start, length - sent)
        read += value.byteLength
        if (available <= 0) continue

        controller.enqueue(value.subarray(start, start + available))
        sent += available
        if (sent === length) {
          controller.close()
          void reader.cancel().catch(() => {})
        }
        return
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}
