import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

async function load(path, dependencies = {}, environment = {}) {
  const compiled = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const compiledModule = { exports: {} }
  new Function("require", "module", "exports", "process", compiled)(name => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  }, compiledModule, compiledModule.exports, { env: environment })
  return compiledModule.exports
}
const tags = await load("../libs/songTags.ts")
const query = await load("../libs/musicRecommendations.ts", { "./songTags": tags })
test("recommendation queries normalize tags and reject invalid bounds", () => {
  assert.deepEqual(query.recommendationQuery(new URLSearchParams("tags=HAPPY,slow,happy&limit=3")), { tags: ["happy","slow"], limit: 3 })
  for (const raw of ["limit=0", "limit=13", "limit=1.5", "tags=%3Cscript%3E", `tags=${"a".repeat(401)}`])
    assert.throws(() => query.recommendationQuery(new URLSearchParams(raw)))
})
test("the public API uses an anonymous client and returns only recommendation metadata", async () => {
  const calls = []
  const route = await load("../app/api/recommendations/route.ts", {
    "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    "@/libs/musicRecommendations": query,
    "@supabase/supabase-js": { createClient: (...arguments_) => {
      calls.push(arguments_)
      return { rpc: async (name, parameters) => {
        calls.push({ name, parameters })
        return { data: [{ id: 7, title: "Rain", author: "Artist", image_path: "cover.webp", tags: ["rainy"],
          playlist_slug: "Quiet evening", matched_tags: ["rainy"], song_path: "private-audio.mp3", user_id: "private-user" }], error: null }
      }, storage: { from: () => ({ getPublicUrl: path => ({ data: { publicUrl: `https://fixture.supabase.co/storage/v1/object/public/images/${path}` } }) }) } }
    } },
  }, { NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SERVICE_ROLE_KEY: "never-use-service" })
  const response = await route.GET(new Request("https://music.jokik.fi/api/recommendations?tags=rainy", {
    headers: { cookie: "purchased=true", authorization: "Bearer never-forward" },
  }))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(calls[0][1], "fixture-anon")
  assert.deepEqual(calls[0][2], { auth: { persistSession: false, autoRefreshToken: false } })
  assert.deepEqual(calls[1], { name: "recommend_public_music", parameters: { p_tags: ["rainy"], p_limit: 6 } })
  assert.equal(data.items[0].href, "https://music.jokik.fi/playlists/Quiet%20evening")
  assert.equal(JSON.stringify(data).includes("private-audio"), false)
  assert.equal(JSON.stringify(data).includes("private-user"), false)
  assert.match(response.headers.get("Cache-Control"), /^public/)
})
test("empty/invalid queries do not contact the catalog; missing setup is a safe error", async () => {
  let calls = 0
  const route = await load("../app/api/recommendations/route.ts", {
    "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    "@/libs/musicRecommendations": query, "@supabase/supabase-js": { createClient: () => { calls++; throw Error("private details") } },
  })
  assert.equal((await route.GET(new Request("https://music.jokik.fi/api/recommendations"))).status, 200)
  assert.equal((await route.GET(new Request("https://music.jokik.fi/api/recommendations?limit=100"))).status, 400)
  const response = await route.GET(new Request("https://music.jokik.fi/api/recommendations?tags=happy"))
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: "Music recommendations are temporarily unavailable." })
  assert.equal(calls, 0)
})
