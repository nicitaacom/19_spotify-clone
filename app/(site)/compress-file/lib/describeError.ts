export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause
    const causeText = cause == null
      ? ""
      : ` Cause: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}.`
    const message = error.message.endsWith(".") ? error.message : `${error.message}.`
    return `${error.name}: ${message}${causeText}`
  }
  return `Error: ${String(error)}`
}

export function namedError(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message)
  error.name = name
  if (cause !== undefined) error.cause = cause
  return error
}
