import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"
import * as guard from "../libs/songCreateGuard.ts"

async function load(modulePath, dependencies) {
  const source = await readFile(new URL(modulePath, import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const compiledModule = { exports: {} }
  const executeModule = new Function("require", "module", "exports", compiled)
  executeModule(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, compiledModule, compiledModule.exports)
  return compiledModule.exports
}

class NextResponse extends Response {
  static json(body, options) { return new NextResponse(JSON.stringify(body), options) }
}

const uploadId = "12345678-1234-4234-8234-123456789abc"
const originalSong = {
  id: 7, user_id: "admin", title: "Server room", author: "unknown", size_bytes: 5,
  song_path: "old.mp3", image_path: "old.png", created_at: "2020-01-01T00:00:00Z", tags: ["ambient"],
}

async function setup({ fail = () => null, membership = true, owner = "admin", concurrent = false, simulateGenreTrigger = false } = {}) {
  const tables = {
    "19_playlists": [{ id: "playlist-1", user_id: "admin", title: "Mix", slug: "mix" }],
    "19_songs": [{ ...originalSong, user_id: owner }],
    "19_playlist_songs": [
      ...(membership ? [{ playlist_id: "playlist-1", song_id: 7, position: 3 }] : []),
      { playlist_id: "playlist-2", song_id: 7, position: 9 },
    ],
    "19_song_access": [
      ...(membership ? [{ playlist_id: "playlist-1", song_id: 7, is_paid: true }] : []),
      { playlist_id: "playlist-2", song_id: 7, is_paid: true },
    ],
    "19_liked_songs": [{ user_id: "listener", song_id: 7 }],
  }
  const files = { songs: new Map([["old.mp3", "old audio"]]), images: new Map([["old.png", "old cover"]]) }
  const events = []
  function from(table) {
    let operation = "select"
    let values
    let limit = Infinity
    let order
    const filters = []
    const query = {
      select: () => query,
      eq: (key, value) => { filters.push([key, value]); return query },
      is: (key, value) => { filters.push([key, value]); return query },
      order: (key, options) => { order = [key, options.ascending]; return query },
      limit: count => { limit = count; return query },
      insert: value => { operation = "insert"; values = value; return query },
      upsert: value => { operation = "upsert"; values = value; return query },
      update: value => { operation = "update"; values = value; return query },
      delete: () => { operation = "delete"; return query },
      maybeSingle: async () => execute(true),
      single: async () => execute(true),
      then: (resolve, reject) => Promise.resolve(execute(false)).then(resolve, reject),
    }
    function execute(single) {
      const event = { table, operation, values, filters }
      events.push(event)
      const error = fail(event)
      if (error) return { data: null, error: { message: error } }
      let rows = tables[table].filter(row => filters.every(([key, value]) => row[key] === value))
      if (operation === "insert" || operation === "upsert") {
        const existing = operation === "upsert" && tables[table].find(row => row.song_id === values.song_id && row.playlist_id === values.playlist_id)
        if (existing) {
          Object.assign(existing, values)
          rows = [existing]
        } else {
          const row = { ...(table === "19_songs" ? { id: 8, created_at: new Date().toISOString() } : {}), ...values }
          tables[table].push(row)
          if (table === "19_playlist_songs" && simulateGenreTrigger) {
            const song = tables["19_songs"].find(item => item.id === row.song_id)
            if (song) song.tags = [...new Set([...song.tags, "chill", "hip-hop"])]
          }
          rows = [row]
        }
      } else if (operation === "update") {
        rows.forEach(row => Object.assign(row, values))
      } else if (operation === "delete") {
        tables[table] = tables[table].filter(row => !rows.includes(row))
      }
      if (order) rows.sort((a, b) => (a[order[0]] < b[order[0]] ? -1 : 1) * (order[1] ? 1 : -1))
      rows = rows.slice(0, limit).map(row => ({ ...row }))
      return { data: single ? rows[0] ?? null : rows, error: null }
    }
    return query
  }
  const admin = {
    from,
    storage: { from: bucket => ({
      upload: async (path, file) => {
        events.push({ bucket, operation: "upload", path })
        const error = fail({ bucket, operation: "upload", path })
        if (error) return { error: { message: error } }
        files[bucket].set(path, file)
        if (concurrent && bucket === "images") tables["19_songs"][0].song_path = "concurrent.mp3"
        return { error: null }
      },
      remove: async paths => {
        events.push({ bucket, operation: "remove", paths })
        paths.forEach(path => files[bucket].delete(path))
        return { error: null }
      },
    }) },
  }
  const row = await load("../libs/songUploadRow.ts", { "@/libs/supabaseAdmin": { supabaseAdmin: admin } })
  const dependencies = {
    "next/server": { NextResponse },
    uniqid: () => "unique",
    "@/libs/supabaseAdmin": { supabaseAdmin: admin },
    "@/libs/getOwnerIds": { isOwnerId: id => id === "admin" },
    "@/libs/helpers": { getSafeStoragePath: ({ prefix, uniqueId, fileName }) => `${prefix}-${uniqueId}.${fileName.split(".").pop()}` },
    "@/libs/errorText": { errorText: error => error.message ?? String(error) },
    "@/libs/songCreateGuard": guard,
    "@/libs/imageFiles": { imageFileError: () => "" },
    "@/libs/songTags": { parseSongTags: () => ["ambient"], normalizeSongTags: tags => tags, inferPlaylistGenreTags: () => simulateGenreTrigger ? ["chill", "hip-hop"] : [] },
    "@/libs/songUploadRow": row,
    "../backup/requireUser": { requireUser: async () => ({ userId: "admin", email: "admin@example.invalid" }) },
    "../../backup/requireUser": { requireUser: async () => ({ userId: "admin", email: "admin@example.invalid" }) },
  }
  const route = await load("../app/api/songs/route.ts", dependencies)
  const status = await load("../app/api/songs/upload-status/route.ts", dependencies)
  async function post({ replaceSongId, title = "Server room", size = 5 } = {}) {
    const data = new FormData()
    data.set("song", new File([new Uint8Array(size)], "audio.mp3", { type: "audio/mpeg" }))
    data.set("image", new File(["cover"], "cover.png", { type: "image/png" }))
    data.set("title", title)
    data.set("author", "unknown")
    data.set("playlistId", "playlist-1")
    data.set("isPaid", "false")
    data.set("uploadId", uploadId)
    if (replaceSongId !== undefined) data.set("replaceSongId", String(replaceSongId))
    return route.POST(new Request("https://music.example/api/songs", { method: "POST", body: data }))
  }
  async function poll(size = 5, id = uploadId) {
    const query = new URLSearchParams({ title: "Server room", author: "unknown", size: String(size), playlistId: "playlist-1", since: String(Date.now()), uploadId: id })
    return status.GET(new Request(`https://music.example/api/songs/upload-status?${query}`))
  }
  return { post, poll, tables, files, events }
}

test("a duplicate returns the existing song ID for the choice dialog, without writing files or rows", async () => {
  const state = await setup()
  const response = await state.post()
  assert.equal(response.status, 409)
  assert.deepEqual(guard.readSongUploadConflict(await response.text()), { id: 7, title: "Server room" })
  assert.equal(state.events.some(event => event.operation !== "select"), false)
})

test("uploading with a new name creates a separate song and leaves the original intact", async () => {
  const state = await setup()
  const response = await state.post({ title: "Server room (copy)" })
  assert.equal(response.status, 200)
  assert.deepEqual(state.tables["19_songs"][0], originalSong)
  assert.equal(state.tables["19_songs"][1].title, "Server room (copy)")
  assert.equal(state.tables["19_playlist_songs"].length, 3)
  assert.equal(state.files.songs.has("old.mp3"), true)
})

test("new uploads retain submitted tags even when an old playlist trigger adds genres", async () => {
  const state = await setup({ simulateGenreTrigger: true })
  const response = await state.post({ title: "New song" })
  assert.equal(response.status, 200)
  assert.deepEqual(state.tables["19_songs"].find(song => song.id === 8).tags, ["ambient"])
})

test("replacement preserves submitted tags after an old playlist trigger runs", async () => {
  const state = await setup({ membership: false, simulateGenreTrigger: true })
  const response = await state.post({ replaceSongId: 7 })
  assert.equal(response.status, 200)
  assert.deepEqual(state.tables["19_songs"][0].tags, ["ambient"])
})

test("an upload is rolled back if submitted tags cannot be restored after linking", async () => {
  const state = await setup({ simulateGenreTrigger: true, fail: event => event.table === "19_songs" && event.operation === "update" ? "Unable to save tags" : null })
  const response = await state.post({ title: "New song" })
  assert.equal(response.status, 400)
  assert.equal(state.tables["19_songs"].some(song => song.id === 8), false)
  assert.equal(state.tables["19_playlist_songs"].some(song => song.song_id === 8), false)
})

test("replacement keeps the song ID, all playlist positions and likes, then removes old files", async () => {
  const state = await setup()
  const memberships = structuredClone(state.tables["19_playlist_songs"])
  const likes = structuredClone(state.tables["19_liked_songs"])
  assert.deepEqual(await (await state.poll()).json(), { id: null })
  const response = await state.post({ replaceSongId: 7 })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, id: 7, replaced: true })
  assert.equal(state.tables["19_songs"].length, 1)
  assert.deepEqual(state.tables["19_playlist_songs"], memberships)
  assert.deepEqual(state.tables["19_liked_songs"], likes)
  assert.equal(state.tables["19_song_access"][1].is_paid, true)
  assert.equal(state.files.songs.has("old.mp3"), false)
  assert.equal(state.files.images.has("old.png"), false)
  assert.equal(state.files.songs.has(`song-${uploadId}.mp3`), true)
  const updateIndex = state.events.findIndex(event => event.table === "19_songs" && event.operation === "update")
  const deleteIndex = state.events.findIndex(event => event.paths?.includes("old.mp3"))
  assert.ok(deleteIndex > updateIndex)
  // created_at remains old: polling must recognize this replacement's files, not its original creation time.
  assert.deepEqual(await (await state.poll()).json(), { id: 7 })
  assert.deepEqual(await (await state.poll(5, "aaaaaaaa-1234-4234-8234-123456789abc")).json(), { id: null })
})

test("replacement can change the audio size and add the existing song to another selected playlist", async () => {
  const state = await setup({ membership: false })
  const response = await state.post({ replaceSongId: 7, size: 10 })
  assert.equal(response.status, 200)
  assert.equal(state.tables["19_songs"][0].size_bytes, 10)
  assert.equal(state.tables["19_playlist_songs"].length, 2)
  assert.equal(state.tables["19_playlist_songs"][0].position, 9)
  assert.deepEqual(await (await state.poll(10)).json(), { id: 7 })
})

test("a failed row update restores paid access and keeps the original song and files", async () => {
  const state = await setup({ fail: event => event.table === "19_songs" && event.operation === "update" ? "Database unavailable. Try Replace again." : null })
  assert.equal((await state.post({ replaceSongId: 7 })).status, 500)
  assert.deepEqual(state.tables["19_songs"][0], originalSong)
  assert.equal(state.tables["19_song_access"][0].is_paid, true)
  assert.deepEqual([...state.files.songs.keys()], ["old.mp3"])
  assert.deepEqual([...state.files.images.keys()], ["old.png"])
})

test("a failed replacement removes a newly added playlist link and access row", async () => {
  const state = await setup({ membership: false, fail: event => event.table === "19_songs" && event.operation === "update" ? "Database unavailable" : null })
  assert.equal((await state.post({ replaceSongId: 7 })).status, 500)
  assert.deepEqual(state.tables["19_playlist_songs"], [{ playlist_id: "playlist-2", song_id: 7, position: 9 }])
  assert.deepEqual(state.tables["19_song_access"], [{ playlist_id: "playlist-2", song_id: 7, is_paid: true }])
})

test("a failed cover upload never changes the existing song", async () => {
  const state = await setup({ fail: event => event.bucket === "images" && event.operation === "upload" ? "Storage unavailable" : null })
  assert.equal((await state.post({ replaceSongId: 7 })).status, 400)
  assert.deepEqual(state.tables["19_songs"][0], originalSong)
  assert.deepEqual([...state.files.songs.keys()], ["old.mp3"])
  assert.deepEqual([...state.files.images.keys()], ["old.png"])
})

test("a concurrently changed song cannot be overwritten by a stale replacement", async () => {
  const state = await setup({ concurrent: true })
  const response = await state.post({ replaceSongId: 7 })
  assert.equal(response.status, 500)
  assert.match((await response.json()).error, /changed during this upload/)
  assert.equal(state.tables["19_songs"][0].song_path, "concurrent.mp3")
  assert.equal(state.files.songs.has("old.mp3"), true)
  assert.equal(state.files.songs.has(`song-${uploadId}.mp3`), false)
})

test("replacing another account's song or a missing song is rejected before storage writes", async () => {
  for (const options of [{ owner: "other-user" }, {}]) {
    const state = await setup(options)
    const response = await state.post({ replaceSongId: options.owner ? 7 : 999 })
    assert.equal(response.status, 404)
    assert.equal(state.events.some(event => event.operation !== "select"), false)
  }
})

test("malformed replacement IDs cannot accidentally create a new song", async () => {
  for (const id of ["", "0", "-1", "abc", "1.5"]) {
    const state = await setup()
    assert.equal((await state.post({ replaceSongId: id })).status, 400)
    assert.equal(state.events.length, 0)
  }
})

test("only structured conflicts with a valid song ID open the replacement dialog", () => {
  assert.equal(guard.readSongUploadConflict("<html>Offline</html>"), null)
  assert.equal(guard.readSongUploadConflict(JSON.stringify({ error: "Already uploading" })), null)
  assert.equal(guard.readSongUploadConflict(JSON.stringify({ code: "song_exists", song: { id: -1, title: "Song" } })), null)
  assert.equal(guard.isUploadId("../old.mp3"), false)
  assert.equal(guard.isUploadId(uploadId), true)
})
