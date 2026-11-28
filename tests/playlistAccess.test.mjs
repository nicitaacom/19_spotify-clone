import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const tables = {
  "19_songs": [
    { id: 1, user_id: "alice" },
    { id: 2, user_id: "bob" },
    { id: 3, user_id: "bob" },
    { id: 4, user_id: "bob" },
  ],
  "19_playlists": [
    { id: "paid", user_id: "bob", visibility: "public", slug: "paid" },
    { id: "private", user_id: "bob", visibility: "private", slug: "private" },
    { id: "unlisted", user_id: "bob", visibility: "unlisted", slug: "unlisted" },
  ],
  "19_playlist_songs": [
    { playlist_id: "paid", song_id: 1 },
    { playlist_id: "paid", song_id: 2 },
    { playlist_id: "private", song_id: 3 },
    { playlist_id: "unlisted", song_id: 4 },
  ],
  "19_song_access": [
    { playlist_id: "paid", song_id: 1, is_paid: true },
    { playlist_id: "paid", song_id: 2, is_paid: true },
  ],
  "19_playlist_orders": [{ playlist_id: "paid", user_id: "buyer", status: "paid" }],
}

const admin = {
  from(table) {
    const filters = []
    const query = {
      select: () => query,
      eq: (key, value) => { filters.push(row => row[key] === value); return query },
      in: (key, values) => { filters.push(row => values.includes(row[key])); return query },
      then: resolve => resolve({ data: tables[table].filter(row => filters.every(filter => filter(row))), error: null }),
    }
    return query
  },
}

const source = await readFile(new URL("../libs/playlistAccess.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const dependencies = {
  "server-only": {},
  react: { cache: fn => fn },
  "@/libs/commerceAdmin": { commerceAdmin: admin },
  "@/libs/supabaseGatewayError": {},
  "@/libs/supabaseServer": {},
  "@/libs/getOwnerIds": { isOwnerId: id => id === "site-owner" },
  "@/libs/commerceRules": {},
}
const loaded = { exports: {} }
const executeModule = new Function("require", "module", "exports", compiled)
executeModule(name => {
  assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
  return dependencies[name]
}, loaded, loaded.exports)
const { getSongAccess, applyPlaylistSongAccess } = loaded.exports

test("song access preserves paid, ownership, purchase and visibility rules", async () => {
  const ids = ["1", "2", "3", "4"]
  const guest = await getSongAccess(ids, { id: null, isOwner: false })
  assert.deepEqual(ids.map(id => guest.get(id).can_play), [false, false, false, true])
  assert.equal(guest.get("2").is_paid, true)
  const alice = await getSongAccess(ids, { id: "alice", isOwner: false })
  assert.deepEqual(ids.map(id => alice.get(id).can_play), [true, false, false, true])
  const buyer = await getSongAccess(ids, { id: "buyer", isOwner: false })
  assert.deepEqual(ids.map(id => buyer.get(id).can_play), [true, true, false, true])
  const playlistOwner = await getSongAccess(ids, { id: "bob", isOwner: false })
  assert.deepEqual(ids.map(id => playlistOwner.get(id).can_play), [true, true, true, true])
})

test("playlist access preserves owner and purchase entitlements", async () => {
  const songs = [{ id: "1", unlock_slug: "paid" }, { id: "2", unlock_slug: "paid" }]
  const guest = await applyPlaylistSongAccess("paid", songs, { id: null, isOwner: false })
  assert.deepEqual(guest.map(song => song.can_play), [false, false])
  const alice = await applyPlaylistSongAccess("paid", songs, { id: "alice", isOwner: false })
  assert.deepEqual(alice.map(song => song.can_play), [true, false])
  const buyer = await applyPlaylistSongAccess("paid", songs, { id: "buyer", isOwner: false })
  assert.deepEqual(buyer.map(song => song.can_play), [true, true])
  const manager = await applyPlaylistSongAccess("paid", songs, { id: "manager", isOwner: false }, true)
  assert.deepEqual(manager.map(song => song.can_play), [true, true])
})
