import {
  createRouteHandlerClient as createSupabaseRouteHandlerClient,
  createServerComponentClient as createSupabaseServerComponentClient,
} from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

import { Database } from "@/app/interfaces/types_db"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseServerClient = ReturnType<typeof createSupabaseServerComponentClient<any>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseRouteClient = ReturnType<typeof createSupabaseRouteHandlerClient<any>>

const createCookieContext = async () => {
  const cookieStore = await cookies()

  return {
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  }
}

export const createServerComponentClient = async <DatabaseSchema = Database>(): Promise<SupabaseServerClient> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseServerComponentClient<any>(await createCookieContext()) as SupabaseServerClient
}

export const createRouteHandlerClient = async <DatabaseSchema = Database>(): Promise<SupabaseRouteClient> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseRouteHandlerClient<any>(await createCookieContext()) as SupabaseRouteClient
}

const supabaseServer = async () => {
  return createServerComponentClient<Database>()
}

export default supabaseServer
