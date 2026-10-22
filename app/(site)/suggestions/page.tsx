import { redirect } from "next/navigation"

import Header from "@/components/Header"
import SuggestionReview from "./SuggestionReview"
import { getIsOwner } from "@/libs/getIsOwner"
import { listPendingSuggestions } from "@/libs/songSuggestions"

export const revalidate = 0

export default async function SuggestionsPage() {
  const isOwner = await getIsOwner()
  if (!isOwner) redirect("/")
  const suggestions = await listPendingSuggestions()

  return (
    <div className="h-full w-full overflow-x-hidden rounded-lg bg-surface text-white">
      <Header className="bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent">
        <div className="mt-10">
          <h1 className="text-4xl font-bold text-white sm:text-5xl">Suggestions</h1>
          <p className="mt-2 text-sm text-neutral-300">{suggestions.length} waiting</p>
        </div>
      </Header>
      <SuggestionReview suggestions={suggestions} />
    </div>
  )
}
