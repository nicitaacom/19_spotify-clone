export interface SourceIdentity {
  name: string
  size: number
  lastModified: number
}

export function exportKey(identity: SourceIdentity, kbps: number): string {
  return `${identity.name}\u0000${identity.size}\u0000${identity.lastModified}\u0000${kbps}`
}

export type ExportAction = "encode" | "save" | "skip"

// "skip" covers the click that follows Escape closing the save dialog.
export function exportAction(keptKey: string | null, key: string, skipUntilMs: number, nowMs: number): ExportAction {
  if (keptKey !== key) return "encode"
  if (nowMs < skipUntilMs) return "skip"
  return "save"
}
