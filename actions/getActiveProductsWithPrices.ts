import { createServerComponentClient } from "@/libs/supabaseServer"
import { ProductWithPrice } from "@/types"

const getActiveProductsWithPrices = async (): Promise<ProductWithPrice[]> => {
  const supabase = await createServerComponentClient()

  const { data, error } = await supabase
    .from("19_products")
    .select("*, prices(*)")
    .eq("active", true)
    .eq("prices.active", true)
    .order("metadata->index")
    .order("unit_amount", { foreignTable: "prices" })

  if (error) {
    console.log(20, "getActiveProductsWithPrices - ", error.message)
  }

  return (data as ProductWithPrice[]) || []
}

export default getActiveProductsWithPrices
