"use client"

type SearchParamsLike = {
  entries: () => IterableIterator<[string, string]>
}

const normalizeQueryValue = (value: string) => decodeURIComponent(value).trim().toLowerCase()

export const isIframeAuth = (searchParams: SearchParamsLike) => {
  const entries = Array.from(searchParams.entries())

  for (let index = 0; index < entries.length; index += 1) {
    const [rawKey, rawValue] = entries[index]
    const key = normalizeQueryValue(rawKey)

    if (key !== "is_iframe") {
      continue
    }

    return normalizeQueryValue(rawValue) === "true"
  }

  return false
}
