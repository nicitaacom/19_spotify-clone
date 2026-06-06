"use client"

import { useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { Database } from "@/app/interfaces/types_db"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { SessionContextProvider } from "@supabase/auth-helpers-react"

interface SupabaseProviderProps {
  children: React.ReactNode
}

const SupabaseProvider: React.FC<SupabaseProviderProps> = ({ children }) => {
  const [supabaseClient] = useState(() => createClientComponentClient<Database>())

  return (
    <SessionContextProvider supabaseClient={supabaseClient as unknown as SupabaseClient}>
      {children}
    </SessionContextProvider>
  )
}

export default SupabaseProvider
