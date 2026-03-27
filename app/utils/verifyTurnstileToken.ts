"use client"

export const verifyTurnstileTokenFn = async (token: string) => {
  const response = await fetch("/api/turnstile/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  })

  const responseBody = (await response.json().catch(() => ({}))) as { error?: string }

  if (!response.ok) {
    return responseBody.error ?? "Please complete the Cloudflare challenge again."
  }

  return true
}
