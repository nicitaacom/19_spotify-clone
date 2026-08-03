// This function may be used on client side and server side.
export const getURL = (path = "") => {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NODE_ENV === "development"
        ? "http://localhost:3023"
          // NEXT_PUBLIC_SITE_URL/NEXT_PUBLIC_VERCEL_URL are intentionally undeclared, vercel autofills these 2
        : // eslint-disable-next-line local-rules/no-undefined-used-envs
          (process.env.NEXT_PUBLIC_PRODUCTION_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL)

  if (!origin) {
    return ""
  }

  const normalizedOrigin = origin.includes("http") ? origin : `https://${origin}`
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path
  const baseUrl =
    normalizedOrigin.charAt(normalizedOrigin.length - 1) === "/" ? normalizedOrigin : `${normalizedOrigin}/`

  return normalizedPath ? `${baseUrl}${normalizedPath}` : baseUrl
}
