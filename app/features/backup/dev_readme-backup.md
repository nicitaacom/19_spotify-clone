# DB Backup & Restore

Available to every authenticated user. Entry point: **Account Settings** (`/account`) → "Backup &
Restore" button → `DbBackupModal`.

**Verified working in production on 2026-07-04:** export tables (CSV), export files (storage),
import tables (CSV), import files (storage) — all four flows, no errors.

<br/>

## The one idea behind the whole feature

**File bytes never pass through a Vercel function.** Every byte moves directly between the
**browser** and **Supabase Storage**; the Vercel function only ever handles small JSON (table rows,
file paths, signed upload URLs). This is what keeps the feature inside all three hard platform
ceilings at once:

| Ceiling (all hard, none raisable in code on the Free/Hobby plans) | How this design stays under it |
| --- | --- |
| **Vercel function memory** (per-invocation) | The server never holds an archive. The browser decompresses + parses it. |
| **Vercel function time** (`maxDuration`, 60s) | Every server call is small bounded work — one table's upsert, or ≤100 signed URLs. |
| **Supabase Storage 50MB per upload** (Free plan global limit) | Each storage file is its own direct browser→Supabase upload, and every file was originally uploaded under that same 50MB rule, so each fits by construction. |

If a future change reintroduces a timeout, a 413, or an out-of-memory crash, the first thing to
check is whether file bytes have been routed back through a Vercel function's request or response
body. Chunking, bigger `maxDuration`, or config flags only delay these ceilings — the fix is always
to keep bytes off the Vercel path entirely. (Several removed approaches learned this the hard way —
see [Failed iterations](#failed-iterations-dont-redo-these).)

<br/>

## Tables and files are two separate backups

The UI, the archives, and the routes all split cleanly in two. This split is deliberate: rows are
tiny and need Postgres; files are large and need Storage. Keeping them apart means a table-only
backup never waits on file downloads, and the large-data path (files) never touches the DB.

| | **Tables (rows)** | **Files (storage)** |
| --- | --- | --- |
| What | `19_songs`, `19_liked_songs`, `19_playlists`, `19_playlist_songs` | song audio + cover image bytes |
| Export file | `19_backup-tables-<date>.tar.gz` (one `.csv` per table) | `19_backup-files-<date>.tar.gz` (`storage/<bucket>/<path>` entries) |
| Import accepts | that `.tar.gz`, **or** loose `.csv` files, partial sets fine | that `.tar.gz` (also accepts old combined archives) |
| Route | `POST/GET /api/backup/rows` | `POST/GET /api/backup/files` |
| Server sees | table rows as JSON | file paths + signed upload URLs only — never bytes |

**Import order matters:** import **tables before files**. File import only restores a file whose
path is found in one of your own `19_songs` rows (the ownership check — see [Security](#security));
if the rows aren't there yet, every file is skipped as "not yours."

**Tables CSV format:** each cell is written per RFC 4180 (`csvClient.ts`). Cells come back as
strings; PostgREST coerces them to the real column type on upsert (int / timestamp / uuid / enum).
Numeric columns (`id`, `size_bytes`, `song_id`, `position`) are converted to real numbers in
`rows/route.ts` before upsert; text columns are left as strings, so a title that happens to be
`"123"` stays text. None of the four backup tables has a JSON/`jsonb` column, so there is no
JSON-cell round-trip concern (the `utm_stats` jsonb column lives on a different table that is not
backed up).

<br/>

## Where the code lives

Split by **runtime**: everything that runs in the browser (or is pure and browser-safe) lives under
`app/features/backup/`; only the server route handlers live under `app/api/backup/`.

```
app/features/backup/            ← all client + pure code, plus this doc
├── BackupSDK.ts                browser orchestration: exportTables / importTables /
│                                 exportFiles / importFiles / downloadBlob
├── useDbBackup.ts              hook: all export/import state, progress, stall watchdog, start* actions
├── useDbBackupModal.ts         Zustand store: isOpen / onOpen / onClose
├── DbBackupModal.tsx           modal UI (render-only; imports Modal from @/components/Modal)
├── tarClient.ts                pure tar build/parse + browser gzip (CompressionStream) and
│                                 gunzip (DecompressionStream) — no Node deps
├── csvClient.ts                pure CSV read/write, RFC 4180 — no Node deps
├── backupTables.ts             pure re-export shim: BACKUP_TABLES/BUCKETS + types + tar helpers
└── dev_readme-backup.md        this file

app/api/backup/                 ← server route handlers only
├── requireUser.ts              auth gate — 401 if no session, returns { userId }
├── rows/route.ts               GET → { tables };  POST { table, rows } → upsert one table
└── files/route.ts              GET → { files };   POST { files:[{bucket,path}] } → signed upload URLs
```

There is **no server-only module in this folder anymore** — `backupTables.ts` used to hold Node
`zlib` helpers, but the archive is now decompressed in the browser, so those were removed. Every
file here is safe to import from the client. (Old rule, now moot: "never import `backupTables` from
the client because it pulls in `zlib`" — it no longer imports `zlib`.)

**Consumers outside the feature folder:**

| File | Uses |
| --- | --- |
| `app/providers/ModalProvider.tsx` | renders `DbBackupModal` |
| `app/(site)/account/components/AccountContent.tsx` | opens the modal via `useDbBackupModal` |

### What the modal looks like

![Backup modal — Tables and Files each with their own Export and Import](/docs/backup-modal.png)

Two cards: **Tables (rows)** and **Files (storage)**, each with a labeled **Export** and **Import**
sub-group, so it is unambiguous which button acts on rows-CSV versus storage. The card content
scrolls inside the modal; the "taking longer than usual" notice and the footer note stay pinned
below the scroll area so they never grow the modal or overflow it.

<br/>

## Flows

### Export tables — `exportTables()` in `BackupSDK.ts`

```
GET /api/backup/rows → { tables: { "19_songs": [...], ... } }
```

1. Fetch all rows (server-side, user-scoped) — small JSON.
2. `toCsv()` each table → `addTarEntry("<table>.csv", …)`.
3. `finalizeTar()` + `gzipBufferClient()` (browser `CompressionStream`) → `19_backup-tables-<date>.tar.gz`.
4. `downloadBlob()` → saved to disk.

### Import tables — `importTables()` in `BackupSDK.ts`

Accepts a `.tar.gz` (decompressed with `gunzipBufferClient` + `parseTar` in the browser) or loose
`.csv` files (table name read from the filename). For each table present, in FK-safe order,
`parseCsv()` then `POST /api/backup/rows { table, rows }` in ≤500-row batches. The route scopes each
batch to the session user (foreign `user_id` rows skipped; `19_playlist_songs` filtered to owned
playlists) and returns `{ rows, skipped }` or the raw Postgres error.

### Export files — `exportFiles()` in `BackupSDK.ts`

```
GET /api/backup/files?includeImages=true → { files: [{ bucket, path, contentType }, ...] }
```

The browser downloads each file **directly from Supabase's public CDN** (`getSupabasePublicUrl`,
concurrency pool of 5), packs `storage/<bucket>/<path>` entries plus `storage-content-types.json`,
gzips locally → `19_backup-files-<date>.tar.gz`. The Vercel function returns only the path list.

```
 Browser (exportFiles)                        Vercel function            Supabase
┌──────────────────────────────┐        ┌───────────────────────┐   ┌───────────────┐
│ 1. request file list ────────┼───────▶│ GET /api/backup/files │──▶│ 19_songs rows │
│                              ◀┼────────┤  { files } (paths)    │   └───────────────┘
│ 2. for each file (pool of 5): GET direct from public CDN — no Vercel involved
│    fetch(publicUrl) ─────────┼──────────────────────────────────▶┌───────────────┐
│    addTarEntry(storage/...) ◀┼──────────────────────────────────┤ songs / images │
│ 3. finalizeTar()+gzip → 19_backup-files-<date>.tar.gz            └───────────────┘
└──────────────────────────────┘
```

### Import files — `importFiles()` in `BackupSDK.ts` (this is the memory-safe path)

The whole archive is decompressed and parsed **in the browser**; the server only ever issues signed
upload URLs and never receives a byte of the archive.

```
 Browser (importFiles)                              Vercel function                Supabase
┌─────────────────────────────────────┐     ┌─────────────────────────┐   ┌──────────────────┐
│ 1. gunzipBufferClient(file)          │     │                         │   │                  │
│    parseTar() → storage/<b>/<p> list │     │                         │   │                  │
│    (all in browser memory)           │     │                         │   │                  │
│                                      │     │                         │   │                  │
│ 2. POST { files:[{bucket,path}] }    │ POST│ /api/backup/files       │   │                  │
│    (≤100 per batch, paths only) ─────┼────▶│  owned-path check →     │──▶│ 19_songs rows    │
│                                     ◀┼─────┤  createSignedUploadUrl  │◀──┤ (ownership)      │
│                                      │     │  { upsert:true } per     │   │                  │
│                                      │     │  owned path; others      │   └──────────────────┘
│                                      │     │  skipped. Returns URLs.  │
│                                      │     └─────────────────────────┘
│ 3. for each granted URL: XHR PUT the file's bytes straight to Supabase (browser → Supabase,
│    never through Vercel). Blob is built with its real content-type so audio/images store right.
│    ──────────────────────────────────────────────────────────────────▶┌──────────────────┐
│                                                                         │ songs / images   │
│                                                                         └──────────────────┘
└─────────────────────────────────────┘
```

**Signed-upload upsert (subtle, verified against `storage-js` source):** upsert for a signed upload
is baked into the **token** at `createSignedUploadUrl(path, { upsert: true })` time — the `upsert`
option passed at PUT time "has no effect" per the SDK's own note. So a re-import overwrites an
existing object only because the URL was created with `{ upsert: true }`. Also, for a `Blob` upload
the stored content-type comes from the **Blob's own `.type`**, not a header — so `importFiles` builds
`new Blob([bytes], { type: contentType })` per file (from `storage-content-types.json`), or audio and
images would be stored as `application/octet-stream` and play/render wrong.

**Backward compatible:** an old combined `19_backup-<date>.tar.gz` (tables + files in one archive)
still imports through the Files import — its `*.json`/`*.csv` non-storage entries are simply ignored.

<br/>

## Import behavior — append + override on conflict

Nothing is ever deleted.

| What | Behavior |
| --- | --- |
| Row already exists (same PK) | **Overwritten** with backup values |
| Row is new | **Inserted** |
| Row not in backup | **Untouched** |
| Storage file already exists | **Overwritten** at the same path |
| Storage file is new | **Uploaded** |
| Storage file not in backup | **Untouched** |

<br/>

## Errors and the "taking longer than usual" notice

**Every error shows the real cause** (per `AI_readme_code-sytle-patterns.md` rule 15 — never a
generic "try again"):

- Server routes return the raw Postgres/Supabase `message` / `code` / `details` / `hint`.
- Client fetch handlers capture the response text first, then try to parse JSON — never falling back
  to a bare status code, so a platform-level HTML error page is still shown verbatim rather than
  swallowed.
- Client-side failures carry stage context, e.g. `<name> is not a valid .tar.gz archive: <reason>`,
  `Failed to import 19_songs (500): <postgres error>`.
- Both export and both import flows have their own error state in `useDbBackup.ts`
  (`tablesExportError`, `filesImportError`, …), rendered under the relevant button.

**Stall watchdog (`useDbBackup.ts`):** `lastProgressRef` is bumped on every progress event; a 1s
interval (only while busy) flips `isStalled` on after `STALL_THRESHOLD_MS` (10s) of no progress, and
back off on the next progress event. The modal shows an amber "Taking longer than usual — still
`<activeLabel>`" notice so a genuinely stuck operation is distinguishable from a slow-but-alive one.

<br/>

## Security

- Both routes are gated by `requireUser()` (`libs/supabaseServer.ts`, async `cookies()` wrapper).
- Reads are `.eq("user_id", userId)`; `19_playlist_songs` is further filtered to the user's own
  playlist IDs.
- **Import ownership is the security boundary.** The server uses `supabaseAdmin` (service role), so
  RLS does not apply — user-ID scoping in application code is what prevents one user from writing
  another's data:
  - Rows with a foreign `user_id` are skipped on upsert.
  - A file gets a signed upload URL **only** if its path is in one of the user's own `19_songs`
    rows. The browser's file list is untrusted; the server decides what may be written. (This is
    also why tables must be imported before files.)

<br/>

## tar / csv / gzip implementation

No external packages.

**`tarClient.ts`** — pure `Buffer` math + the Web `CompressionStream` / `DecompressionStream` APIs,
no Node imports, safe on client or server:

- `buildTarHeader()` / `buildLongNameEntry()` — POSIX ustar header + GNU long-name (`>100` char paths)
- `addTarEntry(chunks, name, data)` / `finalizeTar(chunks)` — build a tar
- `parseTar(buf)` — read entries back (handles GNU long names)
- `gzipBufferClient(bytes)` — browser gzip (`CompressionStream("gzip")`)
- `gunzipBufferClient(bytes)` — browser gunzip (`DecompressionStream("gzip")`) — used by both
  imports to read `.tar.gz` archives entirely in the browser

**`csvClient.ts`** — `toCsv(rows)` / `parseCsv(text)`, RFC 4180 (quoting, `""` escaping, quoted
newlines, empty cell ↔ `null`).

**`backupTables.ts`** — re-exports the pure tar helpers + `BACKUP_TABLES` / `BACKUP_BUCKETS` +
types, so the routes import them from one stable path.

<br/>

## The 50MB Supabase ceiling (still real, just no longer in the way)

Supabase Storage enforces a **project-wide "Global file size limit"** on top of any per-bucket
`fileSizeLimit` — the smaller always wins. On the Free plan it is **fixed at 50MB and the dashboard
control is disabled** (screenshot: [`public/docs/no-way-to-edit-upload-size.png`](/docs/no-way-to-edit-upload-size.png));
raising it requires Supabase Pro. This is a billing/plan constraint, not a bug — do **not**
re-investigate a 413 "Payload too large" as a code issue unless the project has been upgraded.

In the current design this ceiling is a non-issue: each storage file is uploaded on its own, and any
file that exists was originally uploaded under the same 50MB rule, so it fits by construction. There
is no per-archive size limit anymore because the archive is never uploaded as one object — it is
built (export) or consumed (import) entirely in the browser.

<br/>

## What does NOT work / known limits

- **A single storage file larger than 50MB cannot be restored on the Free plan.** No song/image in
  this app should ever exceed 50MB (they were uploaded under the same limit), but if one somehow
  does, its upload URL PUT will 413. This is the Supabase plan ceiling, not a bug.
- **Import tables before files, or files are skipped.** File ownership is checked against
  `19_songs` rows. Importing files into an account whose song rows aren't present yet skips every
  file as "not yours" — reported honestly in the per-bucket counts, not a silent success.
- **Very large libraries still take a while.** Nothing times out (no single request is
  unbounded), but exporting/importing thousands of files is many small round-trips; the stall notice
  exists precisely so a long-but-healthy run doesn't look hung.
- **`backups-tmp` Supabase bucket is dead.** The old chunked import used it; no code references it
  anymore. Safe to delete it manually in the Supabase dashboard.

<br/>

## Failed iterations (don't redo these)

This feature went through several wrong turns before landing on the browser-only-bytes architecture.
Recorded so the same mistakes aren't repeated. **Items 1–9 describe code that no longer exists** —
they are history, kept because each one encodes a ceiling or trap that is easy to walk back into.

1. **Chunking export by file range through the Vercel function** (`from`/`to`/`chunk`,
   `SERVER_BUDGET_MS`, dynamic re-estimation). Downloaded files *through* the function in batches
   with a self-enforced time budget. **Wrong because** a single large file's `download()` was itself
   unbounded and could blow 60s alone, and `finalizeTar`+`gzip` ran after the last budget check.
   Replaced by metadata-only export + direct browser→CDN downloads.

2. **Client-side connection-speed test** (`/api/backup/speed-test`, `measureConnectionSpeed()`) to
   size chunks. **Wrong because** better estimates don't move a ceiling chunking can't move (see #1).

3. **`experimental.middlewareClientMaxBodySize: "2gb"` in `next.config.js`.** Not a real Next.js
   option — silently ignored. Even if real, Vercel's ~4.5MB request-body cap is enforced by the
   platform in front of the function, not by Next.js.

4. **Guessing a size error via regex** (`/size|exceed/i.test(uploadError.message)`), which
   *fabricated* a wrong "exceeds limit" message for a 241MB file. **Wrong because** never synthesize
   an error by pattern-matching another error's text. Fixed by showing the real error verbatim.

5. **Supabase SDK `uploadToSignedUrl()` with no progress** — a single opaque `await`, so a large
   upload looked "stuck at 0/0." Fixed by the hand-rolled `XMLHttpRequest` PUT
   (`uploadToSignedUrlWithProgress`) — still used today for the direct file uploads.

6. **Chasing 413 as a code bug after setting `fileSizeLimit: "1gb"`.** The real cause is the
   Free-plan 50MB global limit (see the ceiling section above). No `createBucket`/`updateBucket` call
   can override it.

7. **Sidebar cover images blank** — turned out to be a CSS `fill` regression in `MediaItem.tsx`
   (commit `668cc8f`), not a URL bug. Separately, genuinely-missing files (404) are now handled by
   `CoverImage.tsx` falling back to `/favicon.png` on load error.

8. **Chunked upload + resumable server processing** (`import-init` issues N ≤40MB signed chunk URLs;
   client PUTs each to `backups-tmp`; `import` route downloads all chunks, `Buffer.concat` +
   `gunzip` + `parseTar`, upserts rows and re-uploads files, budget-checked with an NDJSON
   `{type:"continue", cursor}` resume protocol). This correctly solved the 50MB upload limit (chunks)
   **and** the 60s time limit (resumable cursor) — but see #9 for why it was abandoned. Two real bugs
   were fixed along the way and are worth remembering: (a) the decompress/parse block originally ran
   *before* the `ReadableStream` was constructed, so a slow archive hit `maxDuration` and returned a
   raw HTML 500 the client couldn't parse — fixed by moving all work inside the stream's `start()`;
   (b) a resume cursor with `stage:"download"` silently skipped the tables phase until the condition
   was widened to `stage === "download" || stage === "tables"`.

9. **Reassembling chunks into one Storage object (`import-finalize`), then processing it.**
   Re-uploading the concatenated archive is itself one upload of the full size → re-triggers the
   exact 50MB limit chunking existed to avoid (`Failed to finalize import (500)`). Removing it and
   concatenating **in memory** on the server instead then hit the real wall: holding every chunk
   buffer + the `Buffer.concat` result + the one-shot `gunzip` output simultaneously **exceeded
   Vercel's per-invocation memory ceiling** around ~250MB archives —
   `instance was killed because it ran out of available memory`, right at the
   `Buffer.concat → gunzip` line. Node's `zlib.gunzip` is one-shot (whole input + whole output
   resident), so no server-side buffer trick fixes it; a streaming `createGunzip()` was ruled out
   because the constraint is the memory ceiling itself, not buffer hygiene.

   **This is what the current architecture fixes.** The whole chunked pipeline (routes
   `import-init` / `import` / the combined `export`, plus `importArchive` / `exportWithProgress` /
   NDJSON / cursor code and the Node `zlib` helpers) was **deleted**. Decompression and tar parsing
   moved to the browser (no hard memory ceiling there); files upload one-by-one straight to Supabase.
   Tables and files were split into the two independent flows documented above. Verified working in
   production 2026-07-04.

<br/>

## Playlist folders in Storage

When a song is uploaded with a playlist selected, it is stored under a folder named after the
playlist slug:

```
No playlist:   songs/song-my-title-abc123.mp3
With playlist: songs/my-playlist/song-my-title-abc123.mp3
```

Same rule for cover images in `images`. `getSafeStoragePath()` in `libs/helpers.ts` takes an
optional `folder?: string`; `UploadModal.tsx` passes `selectedPlaylist?.slug`.

### Unique playlist name constraint

Two playlists by the same owner cannot share a title:

```sql
ALTER TABLE "19_playlists"
  ADD CONSTRAINT "19_playlists_user_id_title_key" UNIQUE (user_id, title);
```

`CreatePlaylistModal` catches the `23505` error on the `title` column and shows
"You already have a playlist with this name."
