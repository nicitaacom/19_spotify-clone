declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_PRODUCTION_URL: string

      NEXT_PUBLIC_SUPABASE_URL: string
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string
      SUPABASE_SERVICE_ROLE_KEY: string

      // layers 3 and 4 of the visitor identity - see app/features/UTM/dev_readme-utm.md
      UPSTASH_REDIS_REST_URL: string
      UPSTASH_REDIS_REST_TOKEN: string
      UPSTASH_REDIS_URL: string

      PUSHER_APP_ID: string
      NEXT_PUBLIC_PUSHER_APP_KEY: string
      PUSHER_SECRET: string

      GITHUB_CLIENT_ID: string
      GITHUB_CLIENT_SECRET: string

      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string
      STRIPE_SECRET_KEY: string
      STRIPE_WEBHOOK_SECRET: string

      NEXT_PUBLIC_CLOUDFLARE_SITE_KEY: string
      TURNSTILE_SECRET_KEY: string

      OWNER_IDS_ARR: string

      // 64 hex characters (32 bytes), `openssl rand -hex 32` - encrypts the 19_did cookie and
      // derives the deviceId signing key. Without it no visit resolves an id and no row is written.
      DEVICE_ID_ENCRYPTION_KEY: string
    }
  }

  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          theme?: "auto" | "dark" | "light"
          "error-callback"?: () => void
          "expired-callback"?: () => void
        },
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
  }
}

export {}
