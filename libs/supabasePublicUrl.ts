export function buildSupabasePublicUrl(
  supabaseUrl: string | undefined,
  bucket: string,
  path: string | null | undefined,
): string | null {
  if (!supabaseUrl || !path) return null

  const normalizedBaseUrl = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl
  const encodedPath = path
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/")

  return `${normalizedBaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`
}
