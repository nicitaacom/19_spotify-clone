import { SupabaseClient } from "@supabase/supabase-js"
export { SupabaseClient }

export interface AuthFormProps {
  isActionBlocked: boolean
  supabaseClient: SupabaseClient
  isHumanGateEnabled: boolean
  isVerified: boolean
  token: string | null
  onClose: () => void
  syncCurrentUserFn: (provider: string) => Promise<true | string>
  ensureHumanVerifiedFn: () => Promise<true | string>
  resetTurnstileFn: () => void
}
