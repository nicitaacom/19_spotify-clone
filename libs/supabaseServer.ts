import {
  CookieAuthStorageAdapter,
  CookieOptions,
  CookieOptionsWithName,
  SupabaseClientOptionsWithoutAuth,
  createSupabaseClient,
} from "@supabase/auth-helpers-shared"
import { cookies } from "next/headers"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { GenericSchema } from "@supabase/supabase-js/dist/module/lib/types"

type NextCookieStore = Awaited<ReturnType<typeof cookies>>

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

const buildSupabaseClient = <
  Database,
  SchemaName extends string & keyof Database,
  Schema extends GenericSchema,
>(
  storage: CookieAuthStorageAdapter,
  {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    options,
    cookieOptions,
  }: {
    supabaseUrl?: string
    supabaseKey?: string
    options?: SupabaseClientOptionsWithoutAuth<SchemaName>
    cookieOptions?: CookieOptionsWithName
  } = {},
): SupabaseClient<Database, SchemaName, Schema> => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables or supabaseUrl and supabaseKey are required!",
    )
  }

  return createSupabaseClient<Database, SchemaName, Schema>(supabaseUrl, supabaseKey, {
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
  })
}

export async function createServerComponentClient<
  Database = any,
  SchemaName extends string & keyof Database = "public" extends keyof Database
    ? "public"
    : string & keyof Database,
  Schema extends GenericSchema = Database[SchemaName] extends GenericSchema
    ? Database[SchemaName]
    : any,
>(
  {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    options,
    cookieOptions,
  }: {
    supabaseUrl?: string
    supabaseKey?: string
    options?: SupabaseClientOptionsWithoutAuth<SchemaName>
    cookieOptions?: CookieOptionsWithName
  } = {},
): Promise<SupabaseClient<Database, SchemaName, Schema>> {
  const cookieStore = await cookies()

  return buildSupabaseClient<Database, SchemaName, Schema>(
    new NextServerComponentAuthStorageAdapter(cookieStore, cookieOptions),
    {
      supabaseUrl,
      supabaseKey,
      options,
      cookieOptions,
    },
  )
}

export async function createRouteHandlerClient<
  Database = any,
  SchemaName extends string & keyof Database = "public" extends keyof Database
    ? "public"
    : string & keyof Database,
  Schema extends GenericSchema = Database[SchemaName] extends GenericSchema
    ? Database[SchemaName]
    : any,
>(
  {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    options,
    cookieOptions,
  }: {
    supabaseUrl?: string
    supabaseKey?: string
    options?: SupabaseClientOptionsWithoutAuth<SchemaName>
    cookieOptions?: CookieOptionsWithName
  } = {},
): Promise<SupabaseClient<Database, SchemaName, Schema>> {
  const cookieStore = await cookies()

  return buildSupabaseClient<Database, SchemaName, Schema>(
    new NextRouteHandlerAuthStorageAdapter(cookieStore, cookieOptions),
    {
      supabaseUrl,
      supabaseKey,
      options,
      cookieOptions,
    },
  )
}
