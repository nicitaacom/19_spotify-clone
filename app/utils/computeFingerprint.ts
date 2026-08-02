const CANVAS_TEXT = "19-spotify-device-signals"
const CANVAS_WIDTH = 220
const CANVAS_HEIGHT = 30

// The GPU string behind WEBGL_debug_renderer_info - the strongest single machine signal here.
function getWebglRendererSignal(): string {
  try {
    const canvas = document.createElement("canvas")
    const webgl = canvas.getContext("webgl")
    if (!webgl) return ""

    const debugRendererInfo = webgl.getExtension("WEBGL_debug_renderer_info")
    if (!debugRendererInfo) return ""

    return String(webgl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL) ?? "")
  } catch {
    return ""
  }
}

// A fixed string drawn to a 220x30 canvas - the same drawing renders differently per GPU/driver/font
// stack, so the data URL it produces is itself a machine signal.
function getCanvasSignal(): string {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_HEIGHT

    const context = canvas.getContext("2d")
    if (!context) return ""

    context.textBaseline = "top"
    context.font = "16px 'Arial'"
    context.fillStyle = "#f60"
    context.fillRect(0, 0, 60, 20)
    context.fillStyle = "#069"
    context.fillText(CANVAS_TEXT, 2, 4)

    return canvas.toDataURL()
  } catch {
    return ""
  }
}

/**
 * Layer 4 of the visitor identity - a sha256 over machine/OS/display signals, computed only when the
 * server asks for it (see `trackVisitAction`), since the canvas and WebGL reads cost real time on
 * the main thread.
 *
 * `navigator.userAgent` is left out on purpose: this layer exists to survive a visitor switching
 * browsers on the same machine, and a browser-level signal would change the hash the moment the
 * browser changes, defeating the one case the layer is for.
 */
export async function computeFingerprint(): Promise<string> {
  const signals = [
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    `${navigator.language}|${navigator.languages.join(",")}`,
    String(navigator.hardwareConcurrency ?? ""),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? ""),
    getWebglRendererSignal(),
    getCanvasSignal(),
    navigator.platform,
  ]
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signals.join("~")))

  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}
