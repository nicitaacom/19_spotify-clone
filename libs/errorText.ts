const extraText = (error: object) => {
  const record = error as Record<string, unknown>
  const parts: string[] = []
  const code = record.code
  if (typeof code === "string" && code.trim()) parts.push(`code ${code.trim()}`)
  if (typeof code === "number") parts.push(`code ${code}`)
  if (typeof record.details === "string" && record.details.trim()) parts.push(record.details.trim())
  if (typeof record.hint === "string" && record.hint.trim()) parts.push(`Hint: ${record.hint.trim()}`)
  if (typeof record.status === "number") parts.push(`HTTP ${record.status}`)
  if (!parts.length) return ""
  const text = parts.join(". ")
  return text.endsWith(".") ? ` ${text}` : ` ${text}.`
}

export function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause
    const causeText = cause == null
      ? ""
      : ` Cause: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}.`
    const message = error.message
      ? error.message.endsWith(".") ? error.message : `${error.message}.`
      : "message was empty."
    return `${error.name}: ${message}${extraText(error)}${causeText}`
  }
  if (typeof error === "string" && error.trim()) return `Error: ${error.trim()}`
  if (error == null) return "Error: value was empty."
  if (typeof error === "object") {
    try { return `Error: ${JSON.stringify(error)}` } catch { return `Error: ${String(error)}` }
  }
  return `Error: ${String(error)}`
}

export function namedError(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message)
  error.name = name
  if (cause !== undefined) error.cause = cause
  return error
}

type HttpErrorInput = {
  action: string
  status: number
  statusText?: string
  url?: string
  bodyText?: string
  contentType?: string
}

const bodyDetail = (bodyText: string) => {
  const raw = bodyText.replace(/\s+/g, " ").trim()
  if (!raw) return ""
  try {
    const body = JSON.parse(bodyText) as Record<string, unknown>
    const parts = ["error", "message", "details", "hint"]
      .map(key => body[key])
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    const code = body.code
    if (typeof code === "string" && code.trim()) parts.push(`code ${code}`)
    if (typeof code === "number") parts.push(`code ${code}`)
    if (parts.length) return parts.join(" — ").slice(0, 300)
  } catch {
    // Keep the raw response text when it is not JSON.
  }
  return raw.slice(0, 300)
}

export function httpErrorMessage({ action, status, statusText = "", url = "", bodyText = "", contentType = "" }: HttpErrorInput): string {
  const statusLabel = [String(status), statusText.trim()].filter(Boolean).join(" ")
  const where = url ? ` ${url}` : ""
  const detail = bodyDetail(bodyText)
  if (detail) return `${action} failed: HTTP ${statusLabel}${where}. ${detail}`
  const typeNote = contentType ? ` Content type: ${contentType}.` : ""
  return `${action} failed: HTTP ${statusLabel}${where}. Response body was empty.${typeNote}`
}

export async function readHttpError(response: Response, action: string): Promise<string> {
  const bodyText = await response.text().catch(() => "")
  return httpErrorMessage({
    action,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    bodyText,
    contentType: response.headers.get("content-type") ?? "",
  })
}
