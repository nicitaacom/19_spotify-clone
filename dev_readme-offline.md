# Offline resilience

The site does not attempt to cache authenticated pages or Supabase responses. Those responses are
user-specific and can become stale, so storing them in a shared service-worker cache would be a
privacy and correctness risk.

Instead, the offline layer guarantees graceful failure:

- `OfflineProvider` registers `/sw.js` in production.
- The provider displays a persistent banner when `navigator.onLine` is false.
- Same-origin link navigation is held on the current working page while offline.
- `app/error.tsx` handles interrupted route/RSC loads and offers a retry after reconnection.
- `app/global-error.tsx` provides the equivalent fallback if the root layout fails.
- The service worker uses network-first handling only for document navigations.
- Failed document requests return the precached, self-contained `/offline.html` page instead of the
  browser's `ERR_NETWORK_CHANGED` or generic offline page.

`/online.txt` is intentionally not cached. The offline page requests it with `cache: "no-store"`
before reloading, so pressing **Try again** cannot mistake a cached response for restored internet.

## Important limitation

A service worker must be installed during at least one successful online visit before it can serve
an offline fallback. No website can intercept a first-ever request when the browser has never
downloaded its code.

Streaming tracks and server-backed navigation still require internet access. Already-loaded Slow &
Reverb and 8D audio buffers remain local to the tab, so losing the network does not destroy them.

## Cache policy

`spotify-offline-v1` contains only `/offline.html`. Authenticated HTML, API responses, songs, and
uploaded files are never added to the offline cache. When the cache format changes, increment the
version in `public/sw.js`; activation deletes older `spotify-offline-*` caches.

Cloudflare response rules in `public/_headers` prevent stale service-worker scripts and ensure the
connection probe always reaches the network.
