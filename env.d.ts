declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_PRODUCTION_URL: string

      NEXT_PUBLIC_SUPABASE_URL: string
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string
      SUPABASE_SERVICE_ROLE_KEY: string

      GITHUB_CLIENT_ID: string
      GITHUB_CLIENT_SECRET: string

      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: string
      STRIPE_SECRET_KEY: string
      STRIPE_WEBHOOK_SECRET: string
    }
  }
}

export {}
