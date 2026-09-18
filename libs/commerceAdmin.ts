import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/app/interfaces/types_db"

// Keep catalog/access reads independent of Stripe configuration.
export const commerceAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } }
)
