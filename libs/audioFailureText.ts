import { errorText, httpErrorMessage } from "@/libs/errorText"

const MEDIA_ERROR_TEXT: Record<number, string> = {
  1: "The browser aborted the audio request before it finished (media error 1).",
  2: "The browser hit a network error while reading the audio (media error 2).",
  3: "The browser could not decode the audio (media error 3).",
  4: "The browser rejected the audio file (media error 4).",
}

const PROBE_MS = 8_000

export function mediaErrorCode(error: unknown): number | null {
  if (typeof error === "number" && Number.isInteger(error) && error >= 1 && error <= 4) return error
  if (typeof error === "string" && /^[1-4]$/.test(error.trim())) return Number(error.trim())
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === "number" && Number.isInteger(code) && code >= 1 && code <= 4) return code
  }
  return null
}

export function publicAudioAddress(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url.split("?")[0] || url
  }
}

export function audioFailureDetail(error: unknown, info?: {
  browserMessage?: string
  address?: string
  probe?: string
}): string {
  const code = mediaErrorCode(error)
  const base = code == null ? errorText(error) : MEDIA_ERROR_TEXT[code]
  const parts = [base]
  const browserMessage = info?.browserMessage?.trim()
  if (browserMessage) parts.push(browserMessage.endsWith(".") ? browserMessage : `${browserMessage}.`)
  if (info?.address) parts.push(info.address)
  if (info?.probe) parts.push(info.probe)
  return parts.join(" ")
}

const isAudioType = (contentType: string) => /audio|mpeg|mp4/i.test(contentType)

export async function probeAudioAddress(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  if (!url) return "Audio address was empty."
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_MS)
  try {
    const response = await fetchFn(url, {
      headers: { Range: "bytes=0-1023" },
      signal: controller.signal,
    })
    const contentType = response.headers.get("content-type") ?? ""
    const shownUrl = publicAudioAddress(response.url || url)
    if (response.ok && isAudioType(contentType)) {
      const range = response.headers.get("content-range")
      return `Direct read returned HTTP ${response.status} ${contentType}${range ? `, ${range}` : ""}.`
    }
    const bodyText = await response.text()
    return httpErrorMessage({
      action: "Audio file",
      status: response.status,
      statusText: response.statusText,
      url: shownUrl,
      bodyText,
      contentType,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "Direct read of the audio address produced no response within 8 seconds."
    }
    return errorText(error)
  } finally {
    clearTimeout(timer)
  }
}
