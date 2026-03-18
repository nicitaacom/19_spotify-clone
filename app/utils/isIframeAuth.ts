"use client"

type SearchParamsLike = {
  entries: () => IterableIterator<[string, string]>
}

const normalizeQueryValue = (value: string) => decodeURIComponent(value).trim().toLowerCase()

const hasIframeFlag = (entries: Array<[string, string]>) => {
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

export const isIframeAuth = (searchParams: SearchParamsLike) => {
  return hasIframeFlag(Array.from(searchParams.entries()))
}

export const isIframeAuthFromSearch = (search: string) => {
  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search

  return hasIframeFlag(
    normalizedSearch
      .split("&")
      .filter(Boolean)
      .map(param => {
        const separatorIndex = param.indexOf("=")

        if (separatorIndex === -1) {
          return [param, ""]
        }

        return [param.slice(0, separatorIndex), param.slice(separatorIndex + 1)]
      }),
  )
}
