import {
  createRouteHandlerClient as createSupabaseRouteHandlerClient,
  createServerComponentClient as createSupabaseServerComponentClient,
} from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

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

// No schema type parameter: both helpers cast to `any` internally and always answer the fixed
// SupabaseServerClient / SupabaseRouteClient types, so a <Database> argument never changed anything.
export const createServerComponentClient = async (): Promise<SupabaseServerClient> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseServerComponentClient<any>(await createCookieContext()) as SupabaseServerClient
}

export const createRouteHandlerClient = async (): Promise<SupabaseRouteClient> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSupabaseRouteHandlerClient<any>(await createCookieContext()) as SupabaseRouteClient
}

const supabaseServer = async () => {
  return createServerComponentClient()
}

export default supabaseServer
