import { createServerComponentClient } from "@/libs/supabaseServer"
import { isOwnerId } from "@/libs/getOwnerIds"

// OWNER_IDS_ARR is server-only, so a page that renders owner-only UI reads the session here and
// passes the answer down. useOwnerStore lands one render later (an effect in Sidebar) - fine for a
// button deep in the tree, wrong for a whole section, which would paint the non-owner copy first.
export const getIsOwner = async (): Promise<boolean> => {
  const supabase = await createServerComponentClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return isOwnerId(session?.user?.id)
}
