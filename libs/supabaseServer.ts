import {
  createRouteHandlerClient as createSupabaseRouteHandlerClient,
  createServerComponentClient as createSupabaseServerComponentClient,
} from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

import { Database } from "@/app/interfaces/types_db"

type SupabaseServerClient = ReturnType<typeof createSupabaseServerComponentClient<any>>
type SupabaseRouteClient = ReturnType<typeof createSupabaseRouteHandlerClient<any>>

const createCookieContext = async () => {
  const cookieStore = await cookies()

  return {
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  }
}

export const createServerComponentClient = async <DatabaseSchema = Database>(): Promise<SupabaseServerClient> => {
  // <any> avoids "Type instantiation is excessively deep" from auth-helpers-nextjs generics — return type is cast above
  return createSupabaseServerComponentClient<any>(await createCookieContext()) as SupabaseServerClient
}

export const createRouteHandlerClient = async <DatabaseSchema = Database>(): Promise<SupabaseRouteClient> => {
  // <any> avoids "Type instantiation is excessively deep" from auth-helpers-nextjs generics — return type is cast above
  return createSupabaseRouteHandlerClient<any>(await createCookieContext()) as SupabaseRouteClient
}

const supabaseServer = async () => {
  return createServerComponentClient<Database>()
}

export default supabaseServer
