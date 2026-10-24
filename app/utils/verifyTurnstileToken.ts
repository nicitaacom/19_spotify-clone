"use client"

import { readHttpError } from "@/libs/errorText"

export const verifyTurnstileTokenFn = async (token: string) => {
  const response = await fetch("/api/turnstile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  })

  if (!response.ok) return readHttpError(response, "Cloudflare verification")

  return true
}
