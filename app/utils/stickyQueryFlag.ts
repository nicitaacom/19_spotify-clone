"use client"

// A mode switched on by a query param on the URL an iframe opens the site with (?playOnPhone=1, ?is_iframe=true)
// has to outlive the site's own navigation: router.push("/playlists/<slug>") drops the query, and with it the
// mode (2026-11-02: one click on a playlist inside outreach-tool's music panel and the laptop played the song,
// the phone got nothing). Two layers keep it:
// - this module's memory - the same JS context lives through every client-side navigation, and it needs no
//   storage, which matters inside a cross-site iframe: a browser that blocks third-party cookies throws on
//   sessionStorage there (SecurityError), and a sandboxed frame has none at all
// - sessionStorage - one browsing context (one tab / one iframe), so a reload inside the iframe keeps the mode
// Setting either layer twice changes nothing, so reading during render is fine.
const flagsSeenInThisDocument = new Set<string>()

export const readStickyQueryFlag = (key: string, isOnInSearch: (search: string) => boolean) => {
  const storageKey = `stickyQueryFlag:${key}`
  if (isOnInSearch(window.location.search)) flagsSeenInThisDocument.add(key)
  if (flagsSeenInThisDocument.has(key)) {
    try {
      sessionStorage.setItem(storageKey, "1")
    } catch {
      // no storage in this frame - the memory layer above is enough until a reload
    }
    return true
  }
  try {
    return sessionStorage.getItem(storageKey) === "1"
  } catch {
    return false
  }
}
