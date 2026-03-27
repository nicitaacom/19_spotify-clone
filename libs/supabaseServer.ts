import {
  CookieAuthStorageAdapter,
  CookieOptions,
  CookieOptionsWithName,
  SupabaseClientOptionsWithoutAuth,
  createSupabaseClient,
} from "@supabase/auth-helpers-shared"
import { cookies } from "next/headers"

import type { SupabaseClient } from "@supabase/supabase-js"

type NextCookieStore = Awaited<ReturnType<typeof cookies>>

interface SupabaseServerClientOptions {
  supabaseUrl?: string
  supabaseKey?: string
  options?: SupabaseClientOptionsWithoutAuth<any>
  cookieOptions?: CookieOptionsWithName
}

class NextServerComponentAuthStorageAdapter extends CookieAuthStorageAdapter {
  constructor(
    private readonly cookieStore: NextCookieStore,
    cookieOptions?: CookieOptions,
  ) {
    super(cookieOptions)
  }

  protected getCookie(name: string): string | null | undefined {
    return this.cookieStore.get(name)?.value
  }

  protected setCookie(name: string, value: string): void {}

  protected deleteCookie(name: string): void {}
}

class NextRouteHandlerAuthStorageAdapter extends CookieAuthStorageAdapter {
  constructor(
    private readonly cookieStore: NextCookieStore,
    cookieOptions?: CookieOptions,
  ) {
    super(cookieOptions)
  }

  protected getCookie(name: string): string | null | undefined {
    return this.cookieStore.get(name)?.value
  }

  protected setCookie(name: string, value: string): void {
    this.cookieStore.set(name, value, this.cookieOptions)
  }

  protected deleteCookie(name: string): void {
    this.cookieStore.set(name, "", {
      ...this.cookieOptions,
      maxAge: 0,
    })
  }
}

const buildSupabaseClient = (
  storage: CookieAuthStorageAdapter,
  {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    options,
    cookieOptions,
  }: SupabaseServerClientOptions = {},
): SupabaseClient => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables or supabaseUrl and supabaseKey are required!",
    )
  }

  return (createSupabaseClient as any)(supabaseUrl, supabaseKey, {
    ...options,
    global: {
      ...options?.global,
      headers: {
        ...options?.global?.headers,
        "X-Client-Info": "@supabase/auth-helpers-nextjs@0.8.3",
      },
    },
    auth: {
      storageKey: cookieOptions?.name,
      storage,
    },
  }) as SupabaseClient
}

export async function createServerComponentClient<Database = any>(
  options: SupabaseServerClientOptions = {},
): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  return buildSupabaseClient(
    new NextServerComponentAuthStorageAdapter(cookieStore, options.cookieOptions),
    options,
  )
}

export async function createRouteHandlerClient<Database = any>(
  options: SupabaseServerClientOptions = {},
): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  return buildSupabaseClient(
    new NextRouteHandlerAuthStorageAdapter(cookieStore, options.cookieOptions),
    options,
  )
}
