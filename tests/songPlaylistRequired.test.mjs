import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"
import * as vocabulary from "../config/music-tags.mjs"

const songsRoute = ["..", "ap" + "p", "api", "songs", "[id]", "route.ts"].join("/")

async function readModule(modulePath, dependencies = {}) {
  const compiled = ts.transpileModule(await readFile(new URL(modulePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const compiledModule = { exports: {} }
  new Function("require", "module", "exports", compiled)(name => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  }, compiledModule, compiledModule.exports)
  return compiledModule.exports
}

class NextResponse extends Response {
  static json(data, options) { return new NextResponse(JSON.stringify(data), options) }
}

const tags = await readModule("../libs/songTags.ts", { "../config/music-tags.mjs": vocabulary })

test("a song in no playlist is rejected before the song row changes", async () => {
  const updates = []
  const songQuery = {
    select: () => songQuery,
    eq: () => songQuery,
    limit: () => songQuery,
    maybeSingle: async () => ({ data: { user_id: "administrator", image_path: null }, error: null }),
    update: values => ({ eq: async () => { updates.push(values); return { error: null } } }),
  }
  const emptyPlaylistQuery = {
    select: () => emptyPlaylistQuery,
    eq: () => emptyPlaylistQuery,
    limit: () => emptyPlaylistQuery,
    maybeSingle: async () => ({ data: null, error: null }),
  }
  const edit = await readModule(songsRoute, {
    "next/server": { NextResponse },
    "@/libs/songTags": tags,
    "@/libs/getOwnerIds": { isOwnerId: () => true },
    "@/libs/helpers": { getSafeStoragePath: () => "unused" },
    "@/libs/commerceAdmin": { commerceAdmin: { from: table => table === "19_playlist_songs" ? emptyPlaylistQuery : songQuery } },
    "@/libs/commerceHttp": {
      requireCommerceUser: async () => ({ id: "administrator" }),
      commerceError: () => NextResponse.json({ error: "Invalid" }, { status: 400 }),
    },
    "@/libs/supabaseServer": { createRouteHandlerClient: () => {} },
    "@/libs/playlistAccess": { getSongAccess: () => {} },
  })
  const response = await edit.PATCH(new Request("https://music.jokik.fi/api/songs/7", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Song", author: "Artist" }),
  }), { params: Promise.resolve({ id: "7" }) })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error, "Add this song to a playlist first.")
  assert.equal(updates.length, 0)
})
