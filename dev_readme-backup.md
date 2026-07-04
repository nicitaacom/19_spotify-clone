# DB Backup & Restore

Available to every authenticated user. Entry point: **Account Settings** (`/account`) → "Backup & Restore" button → `DbBackupModal`.

<br/>

## What's in the archive

A single `19_backup-<date>.tar.gz` contains:

```
19_songs.json
19_liked_songs.json
19_playlists.json
19_playlist_songs.json
storage-content-types.json          # { "songs/<path>": "audio/mpeg", ... }
storage/songs/<path>                # raw song bytes
storage/images/<path>               # raw image bytes (only if checkbox ticked)
```

**Tables** (FK-safe order): `19_songs → 19_liked_songs → 19_playlists → 19_playlist_songs`

**Buckets**: `songs` (always), `images` (opt-in via "Include cover images" checkbox)

<br/>

## Files

| File | Purpose |
| --- | --- |
| `app/api/backup/tarClient.ts` | Pure tar builder/parser + types (no Node deps) + browser gzip via `CompressionStream`. Safe to import from client or server. |
| `app/api/backup/backupTables.ts` | Re-exports the pure parts from `tarClient.ts`; also holds the server-only Node `zlib` `gzipBuffer` / `gunzipBuffer` (used by import to decompress uploaded archives) |
| `app/api/backup/requireUser.ts` | Auth gate — 401 if no session, returns `{ userId }` |
| `app/api/backup/export/route.ts` | `GET` — metadata only: `{ tables, files }` (rows + storage file paths). Never touches Storage bytes. |
| `app/api/backup/import-init/route.ts` | `POST { chunkCount }` — issues one signed upload URL per chunk for the `backups-tmp` bucket (also ensures the bucket exists with a 45MB `fileSizeLimit`, matching the per-chunk size) |
| `app/api/backup/import/route.ts` | `POST { chunkPaths, cursor }` — downloads every chunk fresh (server-to-Supabase) and concatenates them in memory, processes the result in resumable, budgeted steps, deletes the chunks once done |
| `app/sdk/BackupSDK.ts` | Client helpers: `exportWithProgress`, `importArchive`, `downloadBlob` |
| `hooks/useDbBackupModal.ts` | Zustand store: `isOpen / onOpen / onClose` |
| `hooks/useDbBackup.ts` | All export/import state and progress |
| `components/DbBackupModal.tsx` | Modal UI |

<br/>

## Why export and import never send big payloads through the Vercel function

Both directions used to route file bytes **through** the Next.js API route (server downloads from Supabase → packs into function memory → streams back / server reads request body → parses). That hit two independent platform ceilings that no amount of chunking or `maxDuration` tuning can move:

- **Vercel function execution time** — hard-capped (`maxDuration`, 60s here). Time spent downloading/uploading storage bytes inside the function counts against this.
- **Vercel function request/response body size** — a separate, lower-level platform cap (~4.5MB) enforced in front of the function itself. No Next.js config (`middlewareClientMaxBodySize` is not a real option and is silently ignored) can raise this.

**The fix used throughout this feature: never put file bytes in the Vercel function's request or response body.** Both directions instead move bytes directly between the **browser** and **Supabase Storage**, and only use the Vercel function for small, fast metadata/DB work:

- **Export** — server returns rows + file paths (tiny JSON). Browser downloads each file straight from Supabase's public CDN and assembles the `.tar.gz` locally.
- **Import** — browser slices the `.tar.gz` into ≤40MB chunks and uploads each straight to a private `backups-tmp` Supabase Storage bucket via a signed upload URL (issued by the server via `import-init`, but the actual bytes never pass through the function). Server then downloads each chunk **from Supabase** (server-to-Supabase, not client-to-Vercel), concatenates them in memory, and processes the result in resumable, budgeted steps.

If a future change reintroduces "the export/import times out" or "413 payload too large," check whether file bytes have been routed back through the API route body before reaching for chunking — chunking only delays the ceiling, it doesn't remove it. The fix is always to keep bytes off the Vercel request/response path entirely.

<br/>

## Export flow

```
GET /api/backup/export?includeImages=true
→ { tables: { "19_songs": [...], ... }, files: [{ bucket, path, contentType }, ...] }
```

One fast request. `BackupSDK.ts`'s `exportWithProgress()`:

1. Fetches the metadata above.
2. Packs each `<table>.json` into a tar buffer (via `addTarEntry` from `tarClient.ts`).
3. Downloads every file directly from `getSupabasePublicUrl(bucket, path)` — a small concurrency pool (5 at a time), reporting progress per completed file.
4. Writes `storage-content-types.json` (MIME type per file, so import knows what content-type to re-upload with).
5. Finalizes the tar and gzips it in the browser (`gzipBufferClient` — built-in `CompressionStream("gzip")`, zero deps), producing one `.tar.gz` Blob.

Always a **single archive** — no splitting, no chunk math, no connection-speed probing. The output is a standard gzip stream, byte-compatible with what the server's `gunzipBuffer` expects on import.

```
 Browser (BackupSDK.exportWithProgress)              Vercel function              Supabase
┌──────────────────────────────────┐          ┌───────────────────────┐     ┌───────────────┐
│                                   │  GET     │                       │     │               │
│  1. request metadata ────────────┼─────────▶│ /api/backup/export    │     │   Postgres    │
│                                   │◀─────────┼─ { tables, files }    │◀────┼─  (rows only) │
│                                   │  (tiny,   │  (no Storage bytes)   │     │               │
│                                   │   fast)   └───────────────────────┘     └───────────────┘
│                                   │
│  2. for each file in `files`:     │  GET (direct, public CDN — no Vercel involved)
│     fetch(getSupabasePublicUrl)  ─┼───────────────────────────────────────▶┌───────────────┐
│     addTarEntry(...)          ◀───┼───────────────────────────────────────┤ Storage bucket│
│     (concurrency pool of 5)       │                                       │ songs/images  │
│                                   │                                       └───────────────┘
│  3. finalizeTar() + gzipBufferClient()                                                     │
│     → single 19_backup-<date>.tar.gz Blob                                                  │
│                                   │
│  4. downloadBlob() → saved to disk│
└──────────────────────────────────┘

Vercel function never touches a song/image byte — only small JSON (rows + paths).
```

<br/>

## Import flow

Upload a single `19_backup-<date>.tar.gz` from the import section. The archive is uploaded in
chunks (Supabase's 50MB global upload limit — see "Hard ceiling" below) and processed in resumable
steps (Vercel's 60s function execution limit), so both hard ceilings apply to individual requests,
never to the whole archive or the whole import. The chunks are never reassembled into one Storage
object — see Failed Iteration #9 for why that was tried and reverted.

```
 Browser (BackupSDK.importArchive)                    Vercel function                    Supabase
┌────────────────────────────────────┐        ┌───────────────────────────┐    ┌──────────────────┐
│ 1. slice file into ≤40MB chunks     │  POST  │                           │    │                  │
│    request N signed upload URLs ───┼───────▶│ /api/backup/import-init   │───▶│ createSignedUploadUrl
│                                     │◀───────┼─ { chunkPaths,            │    │ ×N (backups-tmp,  │
│                                     │        │    signedUrls }           │    │  service role)     │
│                                     │        └───────────────────────────┘    └──────────────────┘
│ 2. XHR PUT each chunk in turn, multipart body (direct upload, browser → Supabase — never enters   │
│    the Vercel function body, and each chunk stays under Supabase's 50MB global limit). Uses XHR   │
│    (not fetch) so upload.onprogress gives real byte progress, summed across all chunks.           │
│    ─────────────────────────────────────────────────────────────────────▶┌──────────────────┐     │
│                                                                            │ backups-tmp       │     │
│                                                                            │ chunk-0 … chunk-N │     │
│                                                                            └──────────────────┘     │
│                                     │                                                               │
│ 3. process, resuming with a cursor │  POST (repeated until "done")                                 │
│    { chunkPaths, cursor } ───────────┼──────▶┌─────────────────────┐                                │
│                                     │        │ /api/backup/import  │  download each chunk ──▶       │
│                                     │        │  Buffer.concat()     │◀── backups-tmp                │
│                                     │        │  gunzipBuffer()      │                               │
│                                     │        │  parseTar()          │                                │
│                                     │        │  upsert rows ────────┼──▶ Postgres (19_songs, ...)    │
│                                     │        │  upload files ───────┼──▶ songs / images buckets      │
│                                     │        │  (budget check before each row batch / file upload;   │
│                                     │        │   over budget → emit "continue" + cursor, stop here)  │
│                                     │        │  remove(chunkPaths) on done/error ─▶ backups-tmp       │
│  NDJSON progress/continue/done/error◀────────┤                      │                                │
│                                     │        └─────────────────────┘                                │
└────────────────────────────────────┘
```

**Server-side processing** (step 3 above): download every chunk fresh and `Buffer.concat` them in
order (downloads have no 50MB limit — only uploads do, which is why the chunks are never merged
back into one Storage object) → `gunzipBuffer` → `parseTar` → resume from the cursor — for each
remaining table, `upsert` rows scoped to the session user; for each remaining
`storage/<bucket>/<path>` entry, re-upload via `supabaseAdmin.storage.from(bucket).upload(path, data, { contentType, upsert: true })`
— content type comes from `storage-content-types.json` in the archive. The elapsed time since the
call started is checked **before every individual row batch and before every individual file
upload** (never only between whole tables); if the 55s budget is exceeded, the route emits
`{ type: "continue", cursor }` and closes the stream — the client immediately calls `/api/backup/import`
again with that cursor and the same `chunkPaths`, and every call re-downloads and re-concatenates
the chunks from scratch (cheap buffer work, bounded by the total archive size cap) before resuming
the actual DB/Storage work at the cursor's position. The chunks in `backups-tmp` are deleted once
the final `done` or an `error` message is sent.

**Max archive size:** each chunk stays under 40MB client-side (`CHUNK_SIZE_BYTES` in `BackupSDK.ts`), with the `backups-tmp` bucket's `fileSizeLimit` set to 45MB (`TMP_BUCKET_SIZE_LIMIT` in `import-init/route.ts`) as a second safety net just above the client target. The **total** archive size is capped at 2GB (`MAX_TOTAL_SIZE_BYTES` in `BackupSDK.ts`, checked before slicing) — 50 chunks at 40MB each, matching `MAX_CHUNK_COUNT` in `import-init/route.ts`. If any of these numbers change, update them in **all three** places. This cap only bounds the one-time chunk download + `Buffer.concat` cost each `import` call redoes — it is not a Storage upload limit, since chunks are never merged back into a single object.

**Hard ceiling this project cannot exceed on the Free plan: 50MB per upload request, and it is NOT editable from code.** Supabase Storage enforces a **project-wide "Global file size limit"** (Dashboard → Storage → Settings) on top of any per-bucket `fileSizeLimit` — the smaller of the two always wins, no matter what `createBucket`/`updateBucket` sets. On the Free plan this global limit is **fixed at 50MB and the input is disabled in the dashboard** (screenshot: [`public/docs/no-way-to-edit-upload-size.png`](public/docs/no-way-to-edit-upload-size.png)) — raising it requires upgrading to Supabase Pro (configurable up to 500GB). This is a billing/plan constraint, not a bug — do not re-investigate a 413 "Payload too large" / "exceeded the maximum allowed size" as a code issue unless the project has actually been upgraded past Free. This is exactly why import chunks each upload to begin with: chunking works within the 50MB ceiling instead of ignoring it.

Import behavior is **append + override on conflict** — nothing is ever deleted:

| What | Behavior |
| --- | --- |
| Row already exists (same PK) | **Overwritten** with backup values |
| Row is new | **Inserted** |
| Row not in backup | **Untouched** — stays as-is |
| Storage file already exists | **Overwritten** at the same path |
| Storage file is new | **Uploaded** |
| Storage file not in backup | **Untouched** |

**Error reporting:** the import stream tracks a `currentStage` label (e.g. `restoring table "19_songs"`, `uploading songs/foo.mp3`) and, on any failure, sends `{ type: "error", message, name, code, details, hint, stage }` — `code`/`details`/`hint` are the real Postgres/Supabase error fields, not just a generic message. The modal shows this directly instead of a hardcoded "Import failed." If you see a bare, undetailed failure again, check that the route's `try/catch` around the whole stream body is still intact — that's what makes error reporting possible at all.

<br/>

## Failed iterations (don't redo these)

This feature went through several wrong turns before landing on the architecture above. Recorded here so the same mistakes aren't repeated:

1. **Chunking export by file range (`from`/`to`/`chunk` params, `SERVER_BUDGET_MS`, dynamic re-estimation).** The original fix attempt for the Vercel 60s timeout kept downloading files *through* the Vercel function, just in smaller batches, with the server self-enforcing a time budget and telling the client where it stopped (`nextFrom`/`isStoppedEarly`) so the client could request the next chunk. **Wrong because:** chunking only delays the ceiling, it doesn't remove it — a single large file's `download()` call was itself unbounded and could still blow the 60s budget on its own, and `finalizeTar`+`gzipBuffer` ran *after* the last budget check so they weren't counted either. Replaced entirely by the metadata-only export + direct browser-to-Supabase downloads described above.

2. **Client-side connection-speed test (`/api/backup/speed-test`, `measureConnectionSpeed()`) to size chunks.** Built to make the chunk-size *estimate* more accurate. **Wrong because:** it was solving the wrong problem — better estimates still don't eliminate the ceiling chunking can't move (see #1). Deleted along with the whole chunking system.

3. **`experimental.middlewareClientMaxBodySize: "2gb"` in `next.config.js`**, meant to allow large import uploads. **Wrong because:** this is not a real Next.js config option — it was silently ignored the entire time. Even if it had been real, it wouldn't have helped: Vercel's serverless function request body cap (~4.5MB) is enforced by the platform in front of the function, not by Next.js. Removed entirely once the signed-URL relay made it moot.

4. **Import: guessing whether an upload error was a size-limit error via regex (`/size|exceed/i.test(uploadError.message)`).** After adding an explicit `fileSizeLimit` on the `backups-tmp` bucket, an unrelated upload error was regex-matched as if it were a size error and the code **fabricated** a wrong "exceeds limit" message — for a 241MB file well under the 1GB limit. **Wrong because:** never synthesize an error message by pattern-matching another error's text; it can be confidently wrong. Fixed by showing the real error (status code + response body) verbatim, and only asserting "exceeds limit" from an actual size comparison (`file.size > TMP_BUCKET_SIZE_LIMIT_BYTES`), not a text guess.

5. **Import: using the Supabase SDK's `uploadToSignedUrl()` with no progress feedback.** The whole upload was a single `await` with zero visibility into progress, so a large file appeared "stuck at 0/0" for however long the upload actually took — indistinguishable from a real hang. **Fixed by** uploading via a hand-rolled `XMLHttpRequest` PUT (`uploadToSignedUrlWithProgress` in `BackupSDK.ts`) using the same multipart shape the SDK sends (`cacheControl` field + file under an empty-string key), which gives real `upload.onprogress` byte counts and the exact HTTP status/response body on failure instead of an SDK-wrapped generic error.

6. **Chasing the 413 "Payload too large" as a code bug after already setting `fileSizeLimit: "1gb"`.** Even with the per-bucket limit raised in code, uploads over 50MB still 413'd. **Wrong assumption:** that any remaining size error must mean the code-side limit isn't applied correctly. **Actual cause:** Supabase's Free-plan **project-wide** "Global file size limit" is hard-fixed at 50MB and the dashboard control is disabled — see the "Hard ceiling" note above and the screenshot. No `createBucket`/`updateBucket` call can override it; it requires a Supabase Pro upgrade. Stop checking bucket config for this specific error once the plan is confirmed to still be Free.

7. **Sidebar cover images rendering blank:** first suspected as a URL-encoding regression (`getSupabasePublicUrl`'s manual `encodeURIComponent` per path segment vs. the old SDK's `getPublicUrl`). Ruled out because `/my-songs` rendered the *same* `image_path` correctly at the same time the sidebar showed blank — if the URL were wrong it would fail everywhere. **Actual root cause:** a CSS/layout regression in `MediaItem.tsx` (commit `668cc8f`) that swapped a working `fill`-inside-a-sized-`relative`-container pattern for fixed `width`/`height` + inline `style`, which collapsed the rendered `<img>` box. Fixed by restoring `fill` (matching the still-working `MySongsContent` pattern) with `sizes={size * 2}px` for a sharp (non-blurry) source. A **second, separate** issue remains open: some covers still show a real broken-image icon (genuine 404 — file missing/never uploaded), not a layout bug — root cause not yet found, see the open item below.

8. **Import: fixing the 50MB upload ceiling alone (chunking) without also fixing processing time.** After chunking uploads to stay under Supabase's global 50MB limit, a large enough archive could still exceed the Vercel 60s function limit **during processing** — `import/route.ts`'s table-upsert-then-file-reupload loop had no time-budget check anywhere in it, so it was a second, independent problem that chunking the upload alone did not touch. **Wrong assumption:** that the 50MB limit and the 60s limit were the same problem, or that solving one would solve the other. **Fixed by** making `import` resumable: it processes the archive in a loop, checking elapsed time **before every individual row batch and every individual file upload** (not just between whole tables) and returning a `{ type: "continue", cursor }` message the client echoes back on the next call. This is deliberately different from Failed Iteration #1's mistake: bytes never route through the Vercel function body during upload (chunks go browser→Supabase directly via signed URLs), and the budget is checked at a fine enough grain that the worst-case overrun is bounded to "one file's upload time," not "however long an entire unchecked loop takes."

9. **Import: reassembling the uploaded chunks into one Storage object before processing (a separate `import-finalize` route).** The first version of chunked import had `import-finalize` download every chunk, `Buffer.concat` them, and **re-upload the combined result as a single object** in `backups-tmp`, which `import` then downloaded and processed. **Wrong because:** re-uploading the reassembled archive is itself one upload request — for any archive over 50MB (i.e. any archive that actually needed chunking in the first place) this hit the exact same Supabase global 50MB limit that chunking was built to avoid, surfacing as a bare `Failed to finalize import (500)` with the real Supabase error ("exceeded the maximum allowed size") buried in a response the client's fallback string swallowed instead of showing verbatim — plus the upload progress bar sat at a stuck 100% for however long finalize took, since nothing reported progress during it. **Fixed by** deleting `import-finalize` entirely: `import` downloads all chunks and `Buffer.concat`s them **in memory** on every call (chunk downloads have no 50MB limit — only uploads do), so the archive is never merged back into a single Storage object. The `chunkPaths` list is passed to `import` directly instead of a reassembled `path`.

<br/>

## Security

- Every route is gated by `requireUser()` — uses `libs/supabaseServer.ts` (async `cookies()` wrapper, required by Next.js 15).
- Export: all DB queries are `.eq("user_id", userId)`. `19_playlist_songs` is further filtered to playlist IDs owned by the user.
- Import: rows whose `user_id` ≠ session user are silently skipped. Storage files are only restored if the path exists in the user's own `19_songs` rows.
- Server uses `supabaseAdmin` (service role) so RLS does not interfere — user-ID scoping in application code is the security boundary.

<br/>

## tar.gz implementation

No external package. Tar logic is split across two files by **where it needs to run**:

**`tarClient.ts`** — pure `Buffer` math + the Web `CompressionStream` API, no Node-only imports. Safe to import from client components (used by the browser to build the export archive) or server routes alike:

- `buildTarHeader()` — 512-byte POSIX ustar header with checksum
- `buildLongNameEntry()` — GNU `././@LongLink` extension for entry names > 100 chars
- `addTarEntry(chunks, name, data)` — appends header + data + padding to a `Buffer[]`
- `finalizeTar(chunks)` — concatenates + two 512-byte zero end-of-archive blocks
- `parseTar(buf)` — reads entries back; handles GNU long-name extension
- `gzipBufferClient(bytes)` — browser gzip via `CompressionStream("gzip")`; output is a standard gzip stream, byte-compatible with the server's `gunzipBuffer`

**`backupTables.ts`** — re-exports everything above (so existing `from "../backupTables"` imports keep working) plus the **server-only** Node `zlib` helpers:

- `gzipBuffer` / `gunzipBuffer` — `zlib.gzip` / `zlib.gunzip` promisified. Only `gunzipBuffer` is actually used (import route decompresses uploaded archives); `gzipBuffer` is kept for symmetry/potential server-side use.

**Do not import `zlib` (directly or transitively) from any file that gets bundled for the client** — it will break the client build. If tar logic needs to be reused client-side again, extend `tarClient.ts`, not `backupTables.ts`.

<br/>

## Playlist folders in Storage

When a song is uploaded with a playlist selected, it is stored under a folder named after the playlist slug:

```
No playlist:   songs/song-my-title-abc123.mp3
With playlist: songs/my-playlist/song-my-title-abc123.mp3
```

Same rule applies to cover images in the `images` bucket. `getSafeStoragePath()` in `libs/helpers.ts` accepts an optional `folder?: string` param. `UploadModal.tsx` passes `selectedPlaylist?.slug` as `folder`.

### Unique playlist name constraint

Two playlists by the same owner cannot share a title. Run once in Supabase SQL editor:

```sql
ALTER TABLE "19_playlists"
  ADD CONSTRAINT "19_playlists_user_id_title_key" UNIQUE (user_id, title);
```

`CreatePlaylistModal` catches the `23505` error on the `title` column and shows:

> "You already have a playlist with this name."
