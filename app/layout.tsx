import "./globals.css"

import { headers } from "next/headers"
import Script from "next/script"

import Sidebar from "../components/Sidebar"
import UserProvider from "./providers/UserProvider"
import ModalProvider from "./providers/ModalProvider"
import ToasterProvider from "./providers/ToastProvider"
import getSongsByUserId from "@/actions/getSongsByUserId"
import Player from "@/components/Player"
import { getIsOwner } from "@/libs/getIsOwner"
import { PlaybackSyncProvider } from "./providers/PlaybackSyncProvider"
import OfflineProvider from "./providers/OfflineProvider"
import { UTMTracker } from "./features/UTM/UTMTracker"

export const metadata = {
  title: "Spotify clone",
  description: "Listen to music!",
  icons: {
    icon: "/favicon.png",
  },
  // Dark Reader rewrites svg stroke/fill into --darkreader-inline-* before hydration.
  // This tag makes that extension remove those edits. The site is already dark.
  other: {
    "darkreader-lock": "true",
  },
}

export const revalidate = 0

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? ""
  if (pathname === "/embed") {
    return (
      <html lang="en" data-embed="" suppressHydrationWarning>
        <body suppressHydrationWarning>{children}</body>
      </html>
    )
  }

  const userSongs = await getSongsByUserId()
  const isOwner = await getIsOwner()

  // Dark Reader sets data-darkreader-* on html/body before hydration.
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
          />
        ) : null}
        <ToasterProvider />
        <OfflineProvider />
        <UTMTracker />
        <UserProvider>
          <PlaybackSyncProvider>
            <ModalProvider />
            <Sidebar songs={userSongs} isOwner={isOwner}>
              {children}
            </Sidebar>
            <Player />
          </PlaybackSyncProvider>
        </UserProvider>
      </body>
    </html>
  )
}
