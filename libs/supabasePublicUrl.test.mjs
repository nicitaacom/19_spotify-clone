import assert from "node:assert/strict"
import test from "node:test"

import { buildSupabasePublicUrl } from "./supabasePublicUrl.ts"

test("resolves restored bucket-relative paths against the target project", () => {
  assert.equal(
    buildSupabasePublicUrl("https://target-project.supabase.co/", "songs", "playlist/My Song.mp3"),
    "https://target-project.supabase.co/storage/v1/object/public/songs/playlist/My%20Song.mp3",
  )
  assert.equal(
    buildSupabasePublicUrl("https://target-project.supabase.co", "images", "nested/cover.png"),
    "https://target-project.supabase.co/storage/v1/object/public/images/nested/cover.png",
  )
})

test("keeps invalid or absent relative paths unresolved", () => {
  assert.equal(buildSupabasePublicUrl(undefined, "songs", "song.mp3"), null)
  assert.equal(buildSupabasePublicUrl("https://target-project.supabase.co", "songs", null), null)
})
