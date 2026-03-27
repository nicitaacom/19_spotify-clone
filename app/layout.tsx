import "./globals.css"

import Sidebar from "../components/Sidebar"
import SupabaseProvider from "./providers/SupabaseProvider"
import UserProvider from "./providers/UserProvider"
import ModalProvider from "./providers/ModalProvider"
import ToasterProvider from "./providers/ToastProvider"
import getSongsByUserId from "@/actions/getSongsByUserId"
import Player from "@/components/Player"
import getActiveProductsWithPrices from "@/actions/getActiveProductsWithPrices"

export const metadata = {
  title: "Spotify clone",
  description: "Listen to music!",
}

export const revalidate = 0

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const userSongs = await getSongsByUserId()
  const products = await getActiveProductsWithPrices()

  return (
    <html lang="en">
      <body>
        <ToasterProvider />
        <SupabaseProvider>
          <UserProvider>
            <ModalProvider products={products} />
            <Sidebar songs={userSongs}>{children}</Sidebar>
            <Player />
          </UserProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
