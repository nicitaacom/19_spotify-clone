"use client"

type SearchParamsLike = {
  entries: () => IterableIterator<[string, string]>
}

const normalizeQueryValue = (value: string) => decodeURIComponent(value).trim().toLowerCase()

export const isIframeAuth = (searchParams: SearchParamsLike) => {
  for (const [rawKey, rawValue] of searchParams.entries()) {
    const key = normalizeQueryValue(rawKey)

    if (key !== "is_iframe") {
      continue
    }

    return normalizeQueryValue(rawValue) === "true"
  }

  return false
}
