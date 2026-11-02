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

Both query flags stick for the whole life of the iframe, not only its first URL: `app/utils/stickyQueryFlag.ts` keeps a flag in module memory + `sessionStorage` once it was on the URL, and `isIframeAuthInThisTab()` / `usePlayOnPhone`'s `readIsPlayOnPhone` read the URL or that stored flag. `app/features/iframe/IframeFlagsTracker.tsx` (root layout) reads both on the first page, because the player, the only other reader of `playOnPhone`, mounts after the first navigation. Without it a click on a playlist (`router.push("/playlists/<slug>")`) dropped `?playOnPhone=1&is_iframe=true` and the site turned back into a normal tab: the laptop played the song, the phone got nothing, Log in opened the embedded modal (2026-11-02, `TODO/2026-11-02_at_16-45`).

In iframe mode `components/Sidebar.tsx` renders `main` without its `py-2 pr-2 rounded-lg`: the frame itself is the card, so the content fills it edge to edge.

How to implement this pattern elsewhere:

1. Detect iframe mode from the URL query string.
2. If iframe mode is active, use a real link or shared auth util to open the production app in a new tab.
3. If iframe mode is not active, keep the normal `authModal.onOpen()` flow.

# Playing on the phone through outreach-tool's music panel (?playOnPhone=1)

outreach-tool's `/dialer` holds this site in a 24rem iframe (`https://music.jokik.fi?playOnPhone=1&is_iframe=true`) and plays what the iframe plays on the GSM phone paired to it, so the song comes out of the Bluetooth headphones paired to the phone - the same ears that hear the call. Confirmed working 2026-11-02.

What `?playOnPhone=1` changes here (`hooks/usePlayOnPhone.ts`, used by `components/PlayerContent.tsx`):

- the Howl plays at volume 0 (`volumeForHowl`) - the laptop stays silent - unless the holding page sends `{ type: "localSound", on: true }` ("play on this laptop too" in the music panel); `{ type: "volume", percent }` then sets its level
- every play / pause / seek / song change / link refresh posts `{ type: "nowPlaying", songId, songUrl, expiresAt, title, author, positionSec, durationSec, isPlaying }` to the holding page - `window.parent.postMessage` with that page's origin, never `"*"`
- the holding page may send `{ type: "play" | "pause" }` (its answered / ended rules) - `usePlayer.requestPlaybackCommand`
- only `PLAY_ON_PHONE_PARENT_ORIGINS` (outreach-tool.com, www.outreach-tool.com, localhost:3000) are accepted as sender or receiver; the page is found from `document.referrer`, else `location.ancestorOrigins`
- the flag sticks across the iframe's own navigation - "Iframe Auth Flow" above (`app/utils/stickyQueryFlag.ts`, `app/features/iframe/IframeFlagsTracker.tsx`). Without that a click on a playlist turned the site back into a normal tab and the laptop played

The other side of the chain: outreach-tool `app/widgets/MusicPanel/` -> `POST /api/gsm/commands` -> the VPS (gsm-outreach-tool `server.ts`) -> the phone (AndroidGSM `MusicPlayer.kt`, `MediaPlayer` as `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE` - Android mutes a `USAGE_MEDIA` player for the whole call, from the dial to the hang-up, found 2026-11-02) -> the headphones. Commands: `MUSIC_PLAY { songUrl, positionSec, volumePercent, title }` / `MUSIC_SEEK { positionSec }` / `MUSIC_PAUSE` / `MUSIC_VOLUME { percent }` / `MUSIC_STOP`. The phone streams the signed Supabase link itself, so a song is fetched twice (the muted iframe + the phone). The phone never resumes on its own: slow internet or a restart -> `MUSIC_STOPPED { reason }` -> the page pauses the iframe and shows a toast, he presses play again.

During a call nothing changes on this site's side - it keeps posting "now playing" and obeys play / pause / volume messages. On the phone the song moves onto the headset's call link at the dial (mono at phone-line quality), keeps its loudness there (the phone lifts its music stream to max on that link), and on the answer outreach-tool applies "keep music on answer at" (0 = pause, N = `MUSIC_VOLUME N`); the hang-up brings the "volume" level back. All confirmed 2026-11-02.

Framing: `middleware.ts` answers every path with `Content-Security-Policy: frame-ancestors 'self' https://outreach-tool.com https://www.outreach-tool.com http://localhost:3000` (`/embed` keeps its own wider list).

Layout inside the iframe: `is_iframe=true` -> `components/Sidebar.tsx` renders `main` without `py-2 pr-2 rounded-lg`. The mobile player row (below md) stays cover + title + play: at 24rem a volume slider in it collided with the like / playlist icons, so the phone's music volume is a row in outreach-tool's music panel instead (his review 2026-11-02).

The page's side is written up in outreach-tool: `app/(routes)/dialer/dev_readme-dialer.md` ("Music panel") and `app/widgets/MusicPanel/dev_readme-music-panel.md`.

# VPS deployment (Coolify + Docker) — the live setup since 2026-11-02

music.jokik.fi runs on the VPS as a Coolify resource built from `Dockerfile`, next to outreach-tool's own image. It is NOT on Cloudflare any more.

Why it moved: streaming a song through the Cloudflare Worker hit the Worker's CPU / resource limits - error 1102 "Worker exceeded resource limits" and the rest of the 11xx family, with the whole site answering 503 once the day's quota was gone. The VPS has no such limit.

Files:

- **`Dockerfile`** - two steps. `builder`: `node:25-alpine`, pnpm 11.5.0, `pnpm install --frozen-lockfile --ignore-scripts`, every env var as `ARG` + `ENV`, `pnpm build`. Runner: copies `.next/standalone`, `.next/static` and `public`, installs `sharp` fresh with npm (pnpm's `.pnpm` symlinks do not survive standalone tracing), `curl` for Coolify's healthcheck, `CMD ["node", "server.js"]` on port 3000.
- **`next.config.js`** - `output: "standalone"` is what the runner step copies. The OpenNext import at the bottom still only matters for `pnpm dev`.
- **`docker-compose.yml`** - the same build args + runtime env, host port 3010 (outreach-tool's compose already takes 3000). For a local run, not used by Coolify.
- **`.dockerignore`** - keeps `.git`, `node_modules`, `.next`, `.open-next`, `.wrangler`, `.env*` and the TODO screenshots out of the build context.

Inside this image `request.url` in a route handler is `https://0.0.0.0:<PORT>/...`, not the public URL: Next standalone builds it from the container's own HOSTNAME + PORT (`next-server.js` `attachRequestMeta`). A redirect made from `url.origin` sends the browser to 0.0.0.0 - that was the login loop on 2026-11-02. Public URLs on the server come from `x-forwarded-host` + `x-forwarded-proto` (Traefik sets both) - see `app/auth/callback/oauth/route.ts` `publicOrigin`.

Every env var is needed at BUILD time too, not only at runtime: `NEXT_PUBLIC_*` are inlined by `next build`, and `libs/stripe.ts`, `libs/deviceIdRedis.ts` and the Supabase clients are created at import time while pages render during the build. In Coolify, tick "Build Variable" on each one. The list is `.env.example`.

Coolify setup:

1. New resource → the GitHub repo, branch `production`, build pack **Dockerfile**, port `3000`.
2. Environment variables: all of `.env.example`, each marked as a build variable as well.
3. Domain `https://music.jokik.fi`. In Cloudflare DNS point the record at the VPS and remove the Worker's custom domain / route for `music.jokik.fi`, otherwise the Worker keeps answering instead of the VPS.
4. Healthcheck: Coolify's default `curl` on `/` works (the image has curl; alpine's wget stops at `::1` while Next listens on IPv4 only).

Local test of the exact image:

```bash
docker compose --env-file .env.local up --build   # → http://localhost:3010
```

Do not use `pnpm deploy` / `pnpm upload` any more - both still push to Cloudflare Workers (see the retired section below) and would put the old setup back in front of the domain.

# Cloudflare Deployment Setup (retired 2026-11-02 - kept for reference)

The site deployed via OpenNext (`@opennextjs/cloudflare`) until it moved to the VPS above. The notes below describe that old setup. Must be committed, not regenerated by `migrate`:

- **`wrangler.jsonc`** — `"name"` and the `WORKER_SELF_REFERENCE` binding's `"service"` must match the actual Worker name in the dashboard, not `package.json`'s `"name"` (`"workspace"`):
  ```jsonc
  "name": "19-spotify-clone",
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "19-spotify-clone" }]
  ```
  Wrong → `Service binding 'WORKER_SELF_REFERENCE' references Worker 'workspace' which was not found. [code: 10143]`

- **`pnpm-workspace.yaml`** — `esbuild`/`workerd` need **both** `onlyBuiltDependencies` and `allowBuilds: true`:
  ```yaml
  onlyBuiltDependencies: [sharp, supabase, unrs-resolver, esbuild, workerd]
  allowBuilds:
    esbuild: true
    workerd: true
  ```
  Missing either → `ERR_PNPM_IGNORED_BUILDS`

- **`package.json`** — pin these as devDependencies, otherwise Cloudflare adds `wrangler` mid-build and skips the allowlist above:
  ```json
  "wrangler": "4.107.1",
  "@opennextjs/cloudflare": "1.20.1"
  ```

Redeploy (old setup only): `pnpm deploy` (local, needs `npx wrangler login`). Git push to `production` isn't reliably auto-deploying on Cloudflare. Today a push to `production` is what Coolify builds - see the VPS section above.


// TODO - I would like to index this page and do google ads (ask Mikke and put some my money to this so I can help people find better music use slow&reverb and 8d for free)