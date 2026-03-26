import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

import { ProductWithPrice } from "@/types"

const getActiveProductsWithPrices = async (): Promise<ProductWithPrice[]> => {
  const cookieStore = await cookies()
  const supabase = createServerComponentClient({
    cookies: () => cookieStore,
  })

  const { data, error } = await supabase
    .from("products")
    .select("*, prices(*)")
    .eq("active", true)
    .eq("prices.active", true)
    .order("metadata->index")
    .order("unit_amount", { foreignTable: "prices" })

  if (error) {
    console.log(20, "getActiveProductsWithPrices - ", error.message)
  }

  return (data as any) || []
}

export default getActiveProductsWithPrices
