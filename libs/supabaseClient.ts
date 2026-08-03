import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { SupabaseClient } from "@supabase/supabase-js"

import { Database } from "@/app/interfaces/types_db"

// No schema type parameter: createClientComponentClient casts to `any` internally (same as
// libs/supabaseServer.ts), so a <Database> argument never changed anything - it silently produced
// a client whose query builders resolve to `never`. Cast the return value instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseClient = createClientComponentClient<any>({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}) as unknown as SupabaseClient<Database>

export default supabaseClient
