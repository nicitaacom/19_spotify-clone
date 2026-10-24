import { Suspense } from "react"

import EmbedClient from "./EmbedClient"

export const metadata = {
  title: "Music recommendation",
  description: "A song recommendation you can place on any site.",
}

export default function EmbedPage() {
  return (
    <Suspense>
      <EmbedClient />
    </Suspense>
  )
}
