"use client"

// A mode switched on by a query param on the URL an iframe opens the site with (?playOnPhone=1, ?is_iframe=true)
// has to outlive the site's own navigation: router.push("/playlists/<slug>") drops the query, and with it the
// mode (2026-11-02: one click on a playlist inside outreach-tool's music panel and the laptop played the song,
// the phone got nothing). Once the param is seen, the flag is kept in sessionStorage - one browsing context,
// so one tab or one iframe, gone when it closes. The write is idempotent, so reading during render is fine.
// A sandboxed frame without storage access throws: then the URL alone decides.
export const readStickyQueryFlag = (key: string, isOnInSearch: (search: string) => boolean) => {
  const isOnNow = isOnInSearch(window.location.search)
  const storageKey = `stickyQueryFlag:${key}`
  try {
    if (isOnNow) {
      sessionStorage.setItem(storageKey, "1")
      return true
    }
    return sessionStorage.getItem(storageKey) === "1"
  } catch {
    return isOnNow
  }
}
