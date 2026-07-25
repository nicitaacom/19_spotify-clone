const CACHE_PREFIX = "spotify-offline"
const CACHE_NAME = `${CACHE_PREFIX}-v1`
const OFFLINE_URL = "/offline.html"

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName)),
      )

      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable()
      }

      await self.clients.claim()
    })(),
  )
})

self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate") return

  event.respondWith(
    (async () => {
      try {
        const preloadResponse = await event.preloadResponse
        if (preloadResponse) return preloadResponse

        return await fetch(event.request)
      } catch {
        const cachedFallback = await caches.match(OFFLINE_URL)
        if (cachedFallback) return cachedFallback

        return new Response("You are offline. Reconnect and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
    })(),
  )
})
