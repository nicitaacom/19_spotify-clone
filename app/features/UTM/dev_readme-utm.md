# UTM visit tracking + the 5-layer visitor identity

Ported from `23_store` (`app/[locale]/dev_readme-utm.md` + `(site)/stats/dev_readme-device-id.md`),
with one addition this project needed: **layer 0, the signed-in account**.

<br/>

## 0. Why this exists (the problem)

A campaign link is posted somewhere — a story, a newsletter, a QR code. The question is which of
those actually brought someone to the app, answered without paying an analytics SaaS and without a
third-party script on the page.

Every visit is attributed to one id, and `utm_stats.user_id` holds it. One person visiting twice must
produce one row, not two — otherwise "500 visits" means nothing.

### What was here before

```ts
// app/actions/trackVisitAction.ts, before
if (!userId) return
```

Three things were wrong with it:

- **signed-out visitors were never recorded at all** — most first-time arrivals from a campaign link
  are signed out, so the exact audience the campaign was aimed at produced zero rows
- **`UTMTracker` was never rendered** — the component existed at `app/features/UTM/UTMTracker.tsx`
  and nothing imported it, so even signed-in visits produced nothing
- **`url` was always `"/"`** — the tracker called `trackVisitAction(userId, params)` with two
  arguments, so `currentUrl` kept its `"/"` default. `utm_stats` is shared with projects
  14/23/26/28/29 and each project's dashboard scopes rows by `url`, so those rows charted nowhere

<br/>

---

## 1. How it looks

Nothing renders. `UTMTracker` returns `null` — the only visible effect is the `utm_*` params
disappearing from the address bar a moment after the page appears.

```
  BROWSER                                    SERVER (trackVisitAction)          REDIS / SUPABASE
  ─────────────────────────────────────      ────────────────────────────       ──────────────────────────────

  layer 0  supabase session  ─────────────►  getSessionUserId ────────────────►  utm:device-id:by-user-id:<uuid>
           (read server-side, never sent)                │                        ex = 30 days
                                                         │
  layer 1  localStorage "deviceIdStore"  ──► storedDeviceId ─┐
           { storedDeviceId: "<transport>" }                 │
                                                             ├─ resolveDeviceIdBeforeFingerprint
  layer 2  cookie "19_did"  (httpOnly)  ───► decryptDeviceId ─┤
           aes-256-gcm(deviceId)                             │
                                                             └─► redis.get ──►  utm:device-id:by-ip:<ip>
  layer 3  request IP  (x-real-ip)  ───────► getRequestIp                        exat = midnight, visitor's tz

           ── all four missed → server answers { needsFingerprint: true } ──

  layer 4  computeFingerprint()  ──────────► resolveDeviceIdFromFingerprint
           sha256 of machine signals              └─► redis.get ─────────────►  utm:device-id:by-fingerprint:<sha256>
                                                                                 ex = 600 (10 min)
           still nothing → createDeviceId()

                                             syncDeviceIdLayers writes all of them back
                                             + one utm_stats row per deviceId per visitor day
```

### Where each piece of code lives

| File                                                                   | Owns                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| [UTMTracker.tsx](UTMTracker.tsx)                                        | the two-phase call and the URL cleanup                      |
| [app/layout.tsx](../../layout.tsx)                                      | mounts `<UTMTracker />` — no props                          |
| [trackVisitAction.ts](../../actions/trackVisitAction.ts)                | resolve order, write-back, the daily dedup, the row insert  |
| [deviceId.ts](../../utils/deviceId.ts)                                  | minting a signed deviceId, verifying one, the transport form |
| [deviceIdKeys.ts](../../utils/deviceIdKeys.ts)                          | the encryption key + the signing key derived from it        |
| [deviceIdCookie.ts](../../utils/deviceIdCookie.ts)                      | layer 2 — encrypt/decrypt, the cookie name                  |
| [requestIp.ts](../../utils/requestIp.ts)                                | layer 3 — reading the IP and deciding it is usable          |
| [computeFingerprint.ts](../../utils/computeFingerprint.ts)              | layer 4 — the signal list and the sha256                    |
| [visitorDayBounds.ts](../../utils/visitorDayBounds.ts)                  | midnight behind / ahead of the visitor, in their timezone   |
| [deviceIdRedis.ts](../../../libs/deviceIdRedis.ts)                      | layers 0, 3 and 4 — the three Redis key shapes and expiries |
| [useDeviceIdStore.ts](../../../store/user/useDeviceIdStore.ts)          | layer 1 — the persisted transport form                      |

### Types

- [TTrackVisitResult](../../../ts/TTrackVisitResult.ts) —
  `{ needsFingerprint: true } | { storedDeviceId: string }`

### What lands in which column

`utm_stats` is shared with projects 14/23/26/28/29 — **never migrate or backfill it.**

| URL param      | `utm_stats` column | Note                                                              |
| -------------- | ------------------ | ----------------------------------------------------------------- |
| `utm_source`   | `source`           | `"organic"` when the URL carried no utm param at all              |
| `utm_medium`   | `medium`           | `"direct"` in the same case                                       |
| `utm_campaign` | `campaign`         | stays NULL when absent                                            |
| `utm_term`     | —                  | the table has no column for it, so it is not stored               |
| `utm_content`  | —                  | same                                                              |
| —              | `url`              | the full landing href, utm params included                        |
| —              | `user_id`          | the resolved deviceId — never the account uuid, see section 6     |
| —              | `user_agent`       | the raw user-agent string the request arrived with                |

### Env vars

```
UPSTASH_REDIS_REST_URL       layers 0, 3, 4
UPSTASH_REDIS_REST_TOKEN     layers 0, 3, 4
DEVICE_ID_ENCRYPTION_KEY     64 hex characters (32 bytes), `openssl rand -hex 32`
```

All three are declared in [env.d.ts](../../../env.d.ts). Without the key no visit resolves an id and
no row is written — every page still renders (see section 6).

<br/>

---

## 2. Terminology

| Term             | Means                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| **visit**        | one `utm_stats` row. At most one per deviceId per visitor day.                         |
| `deviceId`       | `19-<21 body>-<8 check>`. The identity itself, signed — see section 3.                 |
| `storedDeviceId` | the transport form of that id — the only shape localStorage and the browser see.       |
| `userId`         | the Supabase account uuid, read from the verified session. Layer 0.                    |
| `fingerprint`    | sha256 of machine signals. `null` = not computed yet, `""` = computed and empty.       |
| trustworthy IP   | a parseable public address — not loopback, not a private range.                        |
| **write-back**   | `syncDeviceIdLayers` — after resolving, every layer is re-pointed at the winning id.   |
| **visitor day**  | midnight-to-midnight in the visitor's own timezone, not UTC.                           |
| **phase 1 / 2**  | the two `trackVisitAction` calls. Phase 2 happens only when layers 0-3 all missed.     |
| **the cleanup**  | `history.replaceState` stripping the 5 utm params, keeping every other query param.    |

<br/>

---

## 3. How it works (ASCII)

### The deviceId itself

```
  19-Xk29vBq7mTz4LpR8nWc1s-7QF3KMBH
  ^^ ^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^
  |  body: 21 chars of      check: 8 chars of Crockford base32,
  |  [0-9a-zA-Z]            each one a byte of HMAC-SHA256(signing key, body) mod 32
  project prefix
```

Layer 1 is the one layer a visitor owns outright — a localStorage value their own devtools edit —
and its value becomes `utm_stats.user_id`. Without the check, typing `19-whatever` into localStorage
was enough to invent visitors or write rows under someone else's id.

`isValidDeviceId` re-derives the check from the body it was handed and compares with
`timingSafeEqual`, so a hand-typed id is refused and the visit falls through to the other layers as
though localStorage had been empty. Deriving the check takes one HMAC **with the signing key**;
without the key the only route is trying all 32⁸ combinations.

The signing key comes from `DEVICE_ID_ENCRYPTION_KEY` through its own HMAC rather than being a second
env var, so the encrypting use and the signing use never share raw key material.

### Transport form — what localStorage actually holds

The check refuses a hand-typed id, but on its own it leaves the *shape* on display. So the value
written to localStorage is not the id: every character steps 3 places back through
`TRANSPORT_ALPHABET` (`0-9a-zA-Z-`, 63 characters) and the whole string is then reversed.

```
  signed id, server side   19-3gNLK4sp9SVtVHhyHDJmf-YK7332SS
  step 1  (-3 places)      -6X0dKIH1pm6PSqSEevEAGjcXVH400-PP    ← per character, wrapping at the ends
  step 2  (reverse)        PP-004HVXcjGAEveESqSP6mp1HIKd0X6-    ← what devtools shows
```

`-` sits at index 62, so the character that lands on it is whatever was at index 2 (`"2"`), and the
real separators step elsewhere. Nothing in the stored value marks where prefix, body and check begin.

The step and the reversal are a fixed pair — two sample ids give them away. They hide the structure;
they are not what makes an id unforgeable. The keyed check is still the thing that accepts or refuses.

### Layer 0 — the signed-in account

Redis `utm:device-id:by-user-id:<account uuid>` → deviceId, `ex` 30 days, refreshed on every visit.

This layer goes **first** because it is the only exact signal here: the Supabase session already
proved who this is, while localStorage, the cookie, the IP and the fingerprint each only suggest it.

```
  someone clears site data every single visit, but stays signed in
    layer 0 HIT every time ──► the same deviceId, one row per day, forever
```

The account uuid is read server-side inside the action, from `createServerComponentClient()` +
`auth.getSession()`. It is never an argument the browser sends — otherwise anyone could type someone
else's uuid and write `utm_stats` rows under their identity.

### Layer 1 — localStorage

`useDeviceIdStore`, a zustand store with `persist`, localStorage key `deviceIdStore`.

`UTMTracker` reads it with `.getState()` and sends it as the first argument. If the server resolves a
different id, the store is set to the returned transport form so the next visit hits layer 1 again.

### Layer 2 — cookie

`19_did`, set by the server, never read by page JS:

- `httpOnly` — page JS has no access, so a script clearing localStorage leaves this intact
- `sameSite: "lax"`, `secure` in production
- value is `aes-256-gcm` over the deviceId, packed as `iv | authTag | ciphertext` in base64url
- expires at **midnight in the visitor's own timezone**, the same moment the dedup window ends

`decryptDeviceId` returns null on a bad auth tag, so a hand-edited cookie falls through to layer 3 and
the edited value never reaches `utm_stats`.

### Layer 3 — IP

Redis `utm:device-id:by-ip:<ip>` → deviceId, expiring at midnight in the visitor's timezone.

`getRequestIp` reads `x-real-ip` then `x-forwarded-for`, both of which arrive with the request, so
`isTrustworthyIp` refuses anything `net.isIP` will not parse — otherwise a hand-written
`x-forwarded-for: pick-me` becomes a key any number of people aim at. Loopback and the private ranges
(`10.`, `192.168.`, `172.16–31.`, `169.254.`, `fc00::/7`, `fe80::`) are refused too: everyone behind
one router shares them, so they name a household rather than a visitor.

**This layer is a guess, not proof.** Two people behind the same NAT can receive the same deviceId if
one clears storage right after the other visited. Accepted deliberately: over-merging two visitors
into one row is a smaller error than counting one visitor as a new person every day.

### Layer 4 — fingerprint

Redis `utm:device-id:by-fingerprint:<sha256>` → deviceId, TTL **600s**. The hash covers machine, OS
and display signals only:

```
  screen.width x screen.height x screen.colorDepth
  Intl timezone
  navigator.language + navigator.languages
  navigator.hardwareConcurrency
  navigator.deviceMemory
  WEBGL_debug_renderer_info → UNMASKED_RENDERER_WEBGL
  canvas render hash (a fixed string drawn to a 220x30 canvas, toDataURL)
  navigator.platform
```

**No `navigator.userAgent`, deliberately.** This layer exists to survive a visitor switching browsers
on the same machine — a browser-level signal would change the hash the moment the browser changes and
defeat the one case it is for.

The value has to match `^[0-9a-f]{64}$` before it becomes a key: it reaches the server as an action
argument, so without the shape check a caller sends a megabyte of text and has it written to Redis.

### The two-phase request

The browser has no way to tell whether layers 0, 2 and 3 hit — the account and IP mappings sit in
Redis and the cookie is `httpOnly`. So the server asks for the fingerprint only when it needs one.

```
  visit
    │
    ├─ 1. trackVisitAction(storedDeviceId, params, url, timezone)   ← fingerprint arg omitted → null
    │        │
    │        ├─ layer 0/1/2/3 hit ──► { storedDeviceId }  ────────► done, one round trip
    │        │
    │        └─ all missed ─────────► { needsFingerprint: true }
    │                                        │
    └─ 2. computeFingerprint()  ◄─────────────┘     canvas + WebGL reads happen ONLY here
              │  .catch(() => "")
              │
              └─ trackVisitAction(..., fingerprint)   ← "" means tried and empty
                       │
                       ├─ layer 4 hit ──► { storedDeviceId }
                       └─ layer 4 miss ─► deviceId = createDeviceId()
```

The `null` vs `""` distinction on `fingerprint` is what ends the exchange: `null` means "not computed
yet, ask me", `""` means "computed and the browser gave nothing", so the server mints a new id instead
of asking a second time.

### A campaign link, end to end

```
  visit /?utm_source=ig&utm_medium=social&utm_campaign=summer&modal=auth

  params  = { utm_source: "ig", utm_medium: "social", utm_campaign: "summer", modal: "auth" }
  pageUrl = "https://<host>/?utm_source=ig&utm_medium=social&utm_campaign=summer&modal=auth"

  ──► extractUTMParams keeps only source/medium/campaign      (modal is ignored, not stored)
  ──► INSERT { user_id: "19-…", source: "ig", medium: "social", campaign: "summer", url: pageUrl }
  ──► address bar becomes  /?modal=auth
```

### The same visitor, three times in one day

```
  09:00 local  ──► resolve 19-abc…  ──► no row since local midnight  ──► INSERT      ✅
  13:00 local  ──► resolve 19-abc…  ──► row found                    ──► skip        ⏭️
  21:00 local  ──► resolve 19-abc…  ──► row found                    ──► skip        ⏭️
  00:30 local, next day
               ──► resolve 19-abc…  ──► window restarted at midnight  ──► INSERT      ✅

  the write-back still runs on the skipped visits, so the cookie and the Redis keys
  keep their expiry moving with the visitor
```

<br/>

---

## 4. Tests

`pnpm test:unit` — vitest "unit" project, node environment, config in
[vitest.config.mts](../../../vitest.config.mts).

**169 tests over 7 files.** They exercise the real crypto, the real IP parsing and the real timezone
arithmetic; only Supabase, Redis and `next/headers` are replaced with recorders. Every test file
hardcodes a throwaway fixture key, never the deployed one.

| File                                                                     | Covers                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [deviceId.test.ts](../../utils/deviceId.test.ts)                          | minting, the keyed check, 17 refusal cases, the transport form round trip   |
| [deviceIdKeys.test.ts](../../utils/deviceIdKeys.test.ts)                  | key length/hex validation, the missing-env message, signing key derivation  |
| [deviceIdCookie.test.ts](../../utils/deviceIdCookie.test.ts)              | round trip, a flipped bit in iv / auth tag / ciphertext, another key        |
| [requestIp.test.ts](../../utils/requestIp.test.ts)                        | header order, forwarded chains, every private range, unparseable values     |
| [visitorDayBounds.test.ts](../../utils/visitorDayBounds.test.ts)          | 6 timezones incl. 30/45-minute offsets, unknown zones, both clock changes   |
| [deviceIdRedis.test.ts](../../../libs/deviceIdRedis.test.ts)              | all three key shapes, `ex 30d` / `exat` / `ex 600`, 9 refused values        |
| [trackVisitAction.test.ts](../../actions/trackVisitAction.test.ts)        | layer 0-4 order, phase 1 writing nothing, dedup, cookie flags, the columns  |

### What has actually been run

```
 Test Files  7 passed (7)
      Tests  169 passed (169)
```

- ✅ `pnpm test:unit` — 169 passed
- ✅ `pnpm type-check` — clean, no output
- ✅ `pnpm lint` on every file this feature touches — exit 0, zero problems
- ⚠️ `pnpm lint` repo-wide still reports 55 errors + 11 warnings across 34 **other** files. All of
  them predate this work (`no-explicit-any`, `react-hooks/set-state-in-effect`, `ban-ts-comment`) —
  see the TODO.

<br/>

---

## 5. Edge cases

| Case                                                | What happens                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Visitor with no utm params                          | still tracked, as organic / direct                                                  |
| Signed-out visitor                                  | tracked — this is the case the old `if (!userId) return` threw away                 |
| Signs in mid-session                                 | layer 0 has no mapping yet, layer 1 answers, and the account is mapped to that id   |
| Same account on a brand new machine                 | layer 0 hits, so it is the same visitor, not a new one                              |
| Only `utm_term` / `utm_content`                     | the table has no columns for them; the row records organic / direct                 |
| Repeated param (`?utm_source=ig&utm_source=fb`)     | the first value wins                                                                |
| Other query params in the link                      | kept in the address bar, never stored                                               |
| Refresh after landing                               | no second row — the params are already gone, and the dedup holds anyway             |
| localStorage hand-edited                            | refused by the keyed check, the real id is written back over it                      |
| `19_did` cookie hand-edited                         | auth tag fails, the layer behaves as though the cookie were missing                  |
| Local dev / no reverse proxy (`127.0.0.1`)          | the IP layer is skipped entirely, so nobody inherits a stranger's id                |
| An unknown `timezone` argument                      | falls back to a 24h window instead of throwing out of `Intl`                        |
| Clocks go forward (spring)                          | the dedup window covers 25h that day — one hour too wide only skips a duplicate     |
| Clocks go back (autumn)                             | the window covers 23h, so a visit in that first local hour can produce a second row |
| The cookie's last base64url character rewritten     | 15 alternatives decode to identical ciphertext — the auth tag judges tampering       |
| The action fails (no env key, Redis down)           | `UTMTracker` catches it, logs, and the URL cleanup still runs — the page is fine    |

<br/>

---

## 6. Decisions made AGAINST

- **Against `if (!userId) return`.** It threw away every signed-out visit, which is most arrivals from
  a campaign link. The account is now layer 0 — the strongest signal — instead of the only one.

- **Against putting the account uuid in `utm_stats.user_id`.** The account resolves *which deviceId*
  the visit belongs to; the column keeps holding a signed deviceId. Writing the uuid there instead
  would count one person twice — once signed out, once signed in — and the uuid fails
  `isValidDeviceId`, so it would be refused by every layer on the next visit and churn a new id each
  time. Keeping one id shape means the keyed check still guards the column.

- **Against trusting a `userId` argument from the browser.** It is read from the verified session
  inside the action. As a client argument, anyone could type someone else's uuid and write rows under
  it — which is what the old signature allowed.

- **Against the 30-day account TTL being shorter.** An account is exact, so the link stays good for a
  month and is refreshed on every visit. The IP gets one visitor day and the fingerprint 10 minutes,
  because both are guesses.

- **Against `navigator.userAgent` among the fingerprint signals.** It would break the exact case the
  layer is for — the same person switching browsers on one machine.

- **Against sending the fingerprint on every visit.** Canvas and WebGL reads cost real time on the
  main thread, and a returning visitor resolves on layer 0 or 1 without the value ever being read.

- **Against an unencrypted cookie.** It is the one layer the visitor hand-edits; the auth tag makes a
  tampered value fall through instead of being trusted.

- **Against trusting `127.0.0.1` / `::1` as a Redis key.** A server with no reverse proxy in front of
  it never sets `x-real-ip`, so `getRequestIp` returns the same literal string for everyone.

- **Against reading `DEVICE_ID_ENCRYPTION_KEY` at module import.** The action module is imported while
  the root layout renders, so a throw at import over a missing env var would answer every page with a
  500 instead of only stopping visit tracking. `deviceIdKeys.ts` reads the key on first use and
  `UTMTracker` catches the rejected action, so a missing key costs the row and nothing else.

- **Against JSON in `user_agent`.** `23_store` stores a serialized metadata object there (geo +
  UA), because its table has the geo columns to match. This table has none, so the column keeps the
  raw UA string it already held — no change to how existing rows read.

- **Against clearing the whole query string.** Only the 5 utm params are deleted, so a `?modal=…`
  style param a visitor arrived with survives the cleanup.

- **Against `utm_term` / `utm_content` columns.** Adding them means a migration on a table shared with
  five other projects, and no campaign uses them yet.

### TODO

- [ ] 🚨 Nikita — set `DEVICE_ID_ENCRYPTION_KEY`, `UPSTASH_REDIS_REST_URL` and
      `UPSTASH_REDIS_REST_TOKEN` in `.env.local` and in the Cloudflare environment. Until then no
      visit resolves an id and no `utm_stats` row is written. Every page still renders.
- [ ] Clear the 55 pre-existing lint errors in the 34 files listed by `pnpm lint` — unrelated to this
      feature, and 30 of them are `no-explicit-any` in the backup/webhook/route files.
- [ ] Decide whether an e2e spec is worth adding here. `23_store` has one
      (`cypress/e2e/utm-visit-tracking.cy.ts`, 9 scenarios); this project has no e2e runner set up.
      Note for whoever adds it: every test on one machine shares a fingerprint, so layer 4 hands them
      all the same deviceId and the once-per-day dedup then refuses the row a later test wants — give
      each test an empty day rather than resetting Redis.
