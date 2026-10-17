import "server-only"

let loggedServiceRoleRejection = false

/** A rejected API key comes back as `{ message: "Unauthorized", request_id }` with no PostgREST code. */
export function isSupabaseGatewayUnauthorized(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? ""
  return message === "Unauthorized" || message.includes('"message":"Unauthorized"')
}

/**
 * One line per process. Callers that already continue without admin data still need a cause:
 * the thrown gateway body is only `{ message, request_id }`, which hides the env var.
 */
export function logSupabaseServiceRoleRejected(): void {
  if (loggedServiceRoleRejection) return
  loggedServiceRoleRejection = true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "(NEXT_PUBLIC_SUPABASE_URL is empty)"
  console.error(
    `Supabase at ${url} rejected SUPABASE_SERVICE_ROLE_KEY (401 Unauthorized). ` +
      "The key in .env.local is for a different project than NEXT_PUBLIC_SUPABASE_URL. " +
      "Copy SERVICE_ROLE_KEY from that self-hosted stack — the same value production uses — into .env.local, then restart the dev server.",
  )
}
