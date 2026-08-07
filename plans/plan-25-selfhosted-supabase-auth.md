# plan-25 — Self-hosted Supabase auth: OAuth still lands on kong, migration blocked

## 0. Why this exists

Hosted Supabase's free tier caps Storage at 1GB — not enough to upload music to this site. That's
the entire reason for moving to a self-hosted Supabase instance (via Coolify, on a VPS at
`193.24.209.229`, project `supabase-jokik-music`). Auth is the one piece not working yet on the
self-hosted stack; everything else (song upload, playlists, backup/restore) is unaffected by this
plan and keeps working against whatever `NEXT_PUBLIC_SUPABASE_URL` already points at.

> **Priority:** blocks finishing the self-hosted migration — auth is the last broken piece
> **Status:** 🔴 Parked — every fix tried so far has been applied and deployed, symptom is
> unchanged. Stopping here rather than guessing further at infra this session has no access to.

---

## 1. Current symptom — unchanged since the first report

Click "Continue with Google" or "Continue with GitHub" in `AuthModal.tsx` → browser navigates
straight to:

```
https://kong.supabase.music.jokik.fi/auth/v1/authorize?provider=google&redirect_to=...
```

→ `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` / `SSL_ERROR_NO_CYPHER_OVERLAP`. Confirmed in Firefox
private and Chrome incognito, both — rules out a stale copy stored in one specific browser as the
cause.

---

## 2. Everything tried, in order

1. **Found: wrong client was used for OAuth.** `AuthModal.tsx` called `supabaseClient` (the
   general, Kong-routed client) instead of the dedicated `supabaseAuthClient`
   ([libs/supabaseAuthClient.ts](../libs/supabaseAuthClient.ts)). Fixed and deployed —
   `ca6edea fix: use supabaseAuthClient`.
2. **Found: the auth domain itself had no working TLS.** `auth.supabase.music.jokik.fi` failed a
   TLS handshake at the Cloudflare edge — confirmed both by direct browser navigation (typed
   directly into the address bar, not through the app) and by `curl -v` from this session, which
   got `TLS alert, handshake failure (552)` before any certificate exchange. `kong.supabase.music.jokik.fi`
   failed identically in the same test.
3. **Diagnosed likely cause: Cloudflare Universal SSL subdomain depth.** The actual Cloudflare zone
   is `music.jokik.fi` (confirmed by Nikita), not `jokik.fi`. Universal SSL's free wildcard only
   covers the zone apex plus one subdomain level — `*.music.jokik.fi` covers a name like
   `supabase-auth.music.jokik.fi`, but not a two-level name like `auth.supabase.music.jokik.fi`.
4. **Fix: flattened the auth domain to one level** — `supabase-auth.music.jokik.fi`. Completed:
   - Cloudflare DNS: `A` record added, proxied
   - Coolify: Auth service domain field updated, `API_EXTERNAL_URL` updated, service restarted
   - GCP OAuth client: new redirect URI `https://supabase-auth.music.jokik.fi/auth/v1/callback` added
   - Code: [libs/supabaseAuthClient.ts:6](../libs/supabaseAuthClient.ts) and
     [middleware.ts:8](../middleware.ts) both updated to the new domain —
     `b11a987 fix: auth domain to one subdomain level`,
     `207271c fix: middleware still had old auth domain`
   - Deployed by Nikita directly (`pnpm deploy`)
5. **Symptom unchanged after all of the above.** Still redirects to `kong.supabase.music.jokik.fi`,
   not `supabase-auth.music.jokik.fi` — the new domain never even appears in the failed URL.

---

## 3. Confirmed by reading the code — not open, do not re-guess

- The string `kong` does not appear anywhere in this repo's source
  (`grep -rln "kong" **/*.{ts,tsx,js,json,jsonc}` — zero matches). It is not a hardcoded literal in
  the app.
- The only client-side call site for `signInWithOAuth` in the whole repo is
  [components/AuthModal.tsx:98](../components/AuthModal.tsx), and it uses `supabaseAuthClient`.
- `libs/supabaseAuthClient.ts` and `middleware.ts` agree with each other on the domain
  (`supabase-auth.music.jokik.fi`) as of `207271c`.
- The production service worker ([public/sw.js](../public/sw.js)) only intercepts same-origin
  `navigate`-mode requests, network-first, and only falls back to a stored `/offline.html` copy on
  fetch failure. It has no scope over a cross-origin navigation to a `*.jokik.fi` subdomain, so it
  does not cause or mask this symptom — ruled out, not a lead.
- Earlier in this session, the deployed JS bundle for `music.jokik.fi` was verified byte-for-byte
  identical to the local build and confirmed to contain the correct domain string, at commit
  `ca6edea`. That check has not been re-run since the two domain-flattening commits
  (`b11a987`, `207271c`) — worth repeating first in the next session, same method: fetch the
  specific chunk `curl`-side and diff against a fresh local build.

---

## 4. The open mystery

Client code, deployed and byte-verified once already, points at `supabase-auth.music.jokik.fi`.
The browser's very first cross-origin hop still lands on `kong.supabase.music.jokik.fi` instead —
same path (`/auth/v1/authorize`), same query shape, different host. That means either:

- something server-side (GoTrue's own `API_EXTERNAL_URL`/`SITE_URL`, or Kong sitting in front of
  the Auth service regardless of which Coolify "Domain" was hit) is rewriting or redirecting to
  its own canonical host before the request ever reaches Google/GitHub, or
- the redeployed bundle Nikita shipped doesn't actually contain the domain-flattening commits yet
  (untested since `b11a987`/`207271c` — see §3's last bullet).

Nothing in this repo's code explains a cross-origin redirect that changes the hostname — that part
of the OAuth flow happens entirely inside the self-hosted Supabase stack, which this session has no
direct access to (no Coolify login, no container shell, no Kong config file).

---

## 5. Untried, for whoever picks this up next

- Re-run the byte-diff check from §3's last bullet against the *current* live bundle, to rule out
  a stale deploy before looking at infra again.
- Check whether Coolify's "Domains" field on the Auth service actually routes straight to the
  `supabase-auth` (GoTrue) container, or whether it proxies through the shared `supabase-kong`
  container first — if the latter, Kong's own config (not GoTrue's) is what needs the new domain.
- Get `NEXT_PUBLIC_SUPABASE_URL`'s actual value confirmed by Nikita (this session has no read
  access to `.env.local` — real-secret files are off limits by design). If it's already
  `kong.supabase.music.jokik.fi`, that's the "normal" working domain for everything else
  (REST/Storage/Realtime) and explains why only auth is broken.
- Check Coolify/GoTrue logs directly (`Logs` tab on the Auth service) for what GoTrue thinks its
  own external URL is at runtime, rather than trusting the dashboard's env var field.
