export interface SourceIdentity {
  name: string
  size: number
  lastModified: number
}

export function exportKey(identity: SourceIdentity, kbps: number): string {
  return `${identity.name}\u0000${identity.size}\u0000${identity.lastModified}\u0000${kbps}`
}

export type ExportAction = "encode" | "ready"

// The same file and bitrate stay ready. A new file or bitrate encodes.
export function exportAction(keptKey: string | null, key: string): ExportAction {
  if (keptKey !== key) return "encode"
  return "ready"
}
