export type AudioFailureStep = "refresh" | "recover" | "skip" | "stop"

export function nextAudioFailureStep(input: {
  urlNearExpiry: boolean
  started: boolean
  recoveryAttempts: number
  openAttempts: number
  repeatOne: boolean
  hasNext: boolean
  skippedInARow: number
  maxRecoveryAttempts: number
  maxOpenAttempts: number
  maxSkips: number
}): AudioFailureStep {
  if (input.urlNearExpiry) return "refresh"
  if (input.started && input.recoveryAttempts < input.maxRecoveryAttempts) return "recover"
  if (!input.started && input.openAttempts < input.maxOpenAttempts) return "refresh"
  if (!input.repeatOne && input.hasNext && input.skippedInARow < input.maxSkips) return "skip"
  return "stop"
}
