import "./globals.css"

import Script from "next/script"

import Sidebar from "../components/Sidebar"
import SupabaseProvider from "./providers/SupabaseProvider"
import UserProvider from "./providers/UserProvider"
import ModalProvider from "./providers/ModalProvider"
import ToasterProvider from "./providers/ToastProvider"
import getSongsByUserId from "@/actions/getSongsByUserId"
import Player from "@/components/Player"
import { isOwnerId } from "@/libs/getOwnerIds"
import { createServerComponentClient } from "@/libs/supabaseServer"
import { PlaybackSyncProvider } from "./providers/PlaybackSyncProvider"
import OfflineProvider from "./providers/OfflineProvider"

export const metadata = {
  title: "Spotify clone",
  description: "Listen to music!",
  icons: {
    icon: "/favicon.png",
  },
}

export const revalidate = 0

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const userSongs = await getSongsByUserId()

  const supabase = await createServerComponentClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const isOwner = isOwnerId(session?.user?.id)

  return (
    <html lang="en">
      <body>
        {process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY ? (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
          />
        ) : null}
        <ToasterProvider />
        <OfflineProvider />
        <SupabaseProvider>
          <UserProvider>
            <PlaybackSyncProvider>
              <ModalProvider />
              <Sidebar songs={userSongs} isOwner={isOwner}>
                {children}
              </Sidebar>
              <Player />
            </PlaybackSyncProvider>
          </UserProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
