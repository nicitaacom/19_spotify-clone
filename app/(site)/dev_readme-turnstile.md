# Trunstile implementation

### Step 1

In layout.tsx

```tsx
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

### Step 2

Env in .env.local
And update env.d.ts

### Step 3

```tsx
const turnstileRef = useRef<HTMLDivElement>(null)

  const { isVerified } = useVerifyHuman(turnstileRef)


return (

 {process.env.NODE_ENV === "production" && !isVerified && (
          <div ref={turnstileRef} className="absolute cf-turnstile"></div>
        )}
)
```

### Step 4

Somewhere in hooks folder

app/hooks/useVerifyHuman.ts

```tsx
import { RefObject, useEffect, useState } from "react"

export const useVerifyHuman = (turnstileRef: RefObject<HTMLDivElement>) => {
  const [isVerified, setIsVerified] = useState(false) // State for verification status

  useEffect(() => {
    if (turnstileRef.current) {
      // @ts-ignore
      window.turnstile.render(turnstileRef.current, {
        sitekey: process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY,
        callback: (token: string) => {
          setIsVerified(true) // Set verification status to true
        },
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { isVerified }
}
```
