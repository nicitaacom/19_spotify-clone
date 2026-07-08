## Before that it was looking like this

![19_spotify-clone](https://i.imgur.com/YyqXl2t.png)

# Iframe Auth Flow

When this app is opened with `?is_iframe=true`, auth actions should not open the embedded Supabase modal. Instead, they should open the production site in a new tab.

How it works:

- `app/utils/isIframeAuth.ts` normalizes query params, decodes them, lowercases them, and treats both `is_iframe=true` and `is_Iframe=true` as iframe mode.
- `hooks/useIsIframeAuth.ts` reads `window.location.search` on the client and exposes a reliable `isIframe` flag after hydration.
- `app/utils/handleAuthAction.ts` is the shared auth entry point. If `isIframe` is true, it opens `NEXT_PUBLIC_PRODUCTION_URL` in a new tab and appends `is_iframe=true`. If that env var is missing, it falls back to `window.location.origin`.
- `components/Header.tsx` uses a real `<a target="_blank">` for the top-right auth buttons in iframe mode. This is more reliable than `window.open` for the navbar login button.
- Other guest auth entry points such as library/play/like still call `handleAuthAction({ isIframe })`.

How to implement this pattern elsewhere:

1. Detect iframe mode from the URL query string.
2. If iframe mode is active, use a real link or shared auth util to open the production app in a new tab.
3. If iframe mode is not active, keep the normal `authModal.onOpen()` flow.
