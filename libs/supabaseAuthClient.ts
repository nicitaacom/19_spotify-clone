import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { SupabaseClient } from "@supabase/supabase-js"

import { Database } from "@/app/interfaces/types_db"

const NEXT_PUBLIC_SUPABASE_AUTH_URL = "https://auth.supabase.music.jokik.fi"

// No schema type parameter: createClientComponentClient casts to `any` internally (same as
// libs/supabaseServer.ts), so a <Database> argument never changed anything - it silently produced
// a client whose query builders resolve to `never`. Cast the return value instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseAuthClient = createClientComponentClient<any>({
  supabaseUrl: NEXT_PUBLIC_SUPABASE_AUTH_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}) as unknown as SupabaseClient<Database>

export default supabaseAuthClient
