# Turnstile implementation

## Rules

- **Production only** — Turnstile never runs in development (`NODE_ENV !== "production"`). In dev, `isVerified` is `true` and `token` is `"dev-token"` by default, so no challenge is shown and no `/api/turnstile` calls are made.
- **Authentication** — shown for every credential login/register/recover in production when `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` is set.
- **Song upload** — shown with a **10% probability** per upload attempt in production (`TURNSTILE_PROBABILITY = 0.1` in `UploadModal.tsx`).
- Nowhere else.

## Env vars

```
# .env.local
NEXT_PUBLIC_CLOUDFLARE_SITE_KEY=your_site_key   # public, used by the widget
TURNSTILE_SECRET_KEY=your_secret_key             # server-only, used by /api/turnstile
```

Both must be present in production for Turnstile to activate. If `NEXT_PUBLIC_CLOUDFLARE_SITE_KEY` is missing the widget is never rendered (`TurnstileChallenge` returns `null`).

## Files

| File                                          | Role                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `hooks/useVerifyHuman.ts`                     | Renders the Cloudflare widget, returns `{ isVerified, token, resetTurnstileFn, shouldRenderChallenge }`. No-ops in dev. |
| `components/turnstile/TurnstileChallenge.tsx` | UI wrapper around the widget div. Returns `null` when site key is missing.                                              |
| `app/utils/verifyTurnstileToken.ts`           | Client-side fetch to `POST /api/turnstile`.                                                                             |
| `app/api/turnstile/route.ts`                  | Server route — forwards token + secret to Cloudflare's siteverify endpoint.                                             |

## Usage pattern

```tsx
const IS_PROD = process.env.NODE_ENV === "production"
const isHumanGateEnabled = IS_PROD && Boolean(process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY)

const turnstileRef = useRef<HTMLDivElement>(null)
const { isVerified, token, resetTurnstileFn } = useVerifyHuman(turnstileRef, {
  isEnabled: isOpen && isHumanGateEnabled,
})

// Block the action until verified (production only)
const isBlocked = isLoading || (isHumanGateEnabled && !isVerified)

// Before submitting, verify server-side
if (isHumanGateEnabled) {
  const result = await verifyTurnstileTokenFn(token)
  if (typeof result === "string") {
    /* show error */ return
  }
}

// In JSX
{
  isHumanGateEnabled && <TurnstileChallenge turnstileRef={turnstileRef} isVerified={isVerified} />
}
```

## layout.tsx

The Cloudflare script must be loaded globally:

```tsx
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
```
