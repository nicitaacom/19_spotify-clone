# DB Backup & Restore

Available to every authenticated user. Entry point: **Account Settings** (`/account`) → "Backup &
Restore" button → `DbBackupModal`.

**Verified working in production on 2026-07-04:** export tables (CSV), export files (storage),
import tables (CSV), import files (storage) — all four flows, no errors. **Ported to
`26_hot-delivery` on 2026-07-04**, proving the design below is genuinely copy-pastable.

<br/>

## Porting this feature into another project (SOP)

Everything project-specific lives in **one file: `backupConfig.ts`**. Nothing else in
`app/features/backup/` or `app/api/backup/` should need to change. If you (the AI doing the port)
find yourself editing a route or `BackupSDK.ts` to make a project's schema fit, stop — that almost
always means `backupConfig.ts`'s shape needs a new field, not that the routes need project-specific
logic again.

### 1. Copy these files as-is

```
app/features/backup/tarClient.ts         (pure archive plumbing — never edit)
app/features/backup/csvClient.ts         (pure CSV read/write — never edit)
app/features/backup/backupTables.ts      (re-export shim — never edit)
app/features/backup/BackupSDK.ts         (browser orchestration — never edit)
app/features/backup/useDbBackup.ts       (hook — never edit)
app/features/backup/useDbBackupModal.ts  (zustand open/close store — never edit)
app/features/backup/DbBackupModal.tsx    (modal UI — edit only the copy strings, e.g. table names in
                                          the description text; the structure/logic stays)
app/features/backup/ModalContainer.tsx   (self-contained modal shell — copy as-is; if the target
                                          project already has its own modal primitive, prefer that
                                          one instead of this file)
app/api/backup/requireUser.ts            (auth gate — see step 4, its body may need a small edit)
app/api/backup/rows/route.ts             (generic — never edit)
app/api/backup/files/route.ts            (generic — never edit)
```

### 2. Write `backupConfig.ts` — the only file you write from scratch

This is the contract both routes and the SDK import from. See the two existing implementations for
the full shape: [`19_spotify-clone`'s](./backupConfig.ts) (per-user) and
[`26_hot-delivery`'s](../../../26_hot-delivery/app/features/backup/backupConfig.ts) (admin-role).
Skeleton:

```ts
export interface BackupTableConfig {
  name: string                // exact table name
  onConflict: string          // PK column(s) for upsert, comma-separated for composite keys
  numericColumns: string[]    // CSV string → number on import
  arrayColumns: string[]      // Postgres text[] round-trip
  jsonColumns: string[]       // jsonb / jsonb[] round-trip
  scopeSelect?: (admin, userId) => Promise<{ data, error }>   // omit if no per-user row scoping
  scopeRows?: (admin, userId, rows) => Promise<rows>          // omit if no per-user row scoping
}

export const BACKUP_TABLES: BackupTableConfig[]   // FK-safe order
export const BACKUP_BUCKETS: string[]

export async function assertBackupAccess(userId, admin): Promise<boolean>
export async function listFiles(admin, userId): Promise<BackupFileRef[]>
export async function isOwnedFile(admin, userId, bucket, path): Promise<boolean>
export function getPublicUrl(bucket, path): string
```

### 3. Questions to ask the user before writing it

Ask these up front rather than guessing — guessing produced three real bugs during the
hot-delivery port (wrong column name, wrong PK, wrong column type; see the two worked examples
below). **Always cross-check every answer against the project's actual `types_db.ts` /
generated Supabase types before writing the config** — a markdown doc or a verbal description of
the schema can be stale; the generated types file is the current truth.

1. **Which tables should be backed up, in FK-safe order?** (parents before children)
2. **For each table: what's the primary key?** (single column, or composite — comma-separated)
3. **For each table: which columns are numeric, `text[]`, or `jsonb`/`jsonb[]`?** (everything else
   is left as a string; PostgREST coerces timestamp/uuid/enum/bool from text automatically)
4. **Which storage buckets should be backed up?**
5. **What decides who may run a backup, and what decides which rows/files they may read or write?**
   Two common shapes — ask which one applies (or if it's something else entirely):
   - *Per-user*: every table scoped by a `user_id` column; a file is owned if its path appears in
     some table's path column. → `assertBackupAccess` always returns `true`; every table sets
     `scopeSelect`/`scopeRows`; `listFiles`/`isOwnedFile` derive from that owning table.
   - *Role/admin-gated*: one global gate (e.g. `users.roles` includes `"ADMIN"`), no per-row
     scoping. → `assertBackupAccess` does the role check; tables omit `scopeSelect`/`scopeRows`;
     `listFiles`/`isOwnedFile` list/check the buckets directly (`storage.list()`).
6. **How is a stored file's public URL built?** (usually
   `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/<bucket>/<path>` — confirm the env var
   name matches this project)

### 4. Files to request if missing

The AI cannot proceed without these — ask for them rather than assuming a shape:

- **The generated `types_db.ts`** (or equivalent Supabase type-gen output) — the source of truth
  for every column name/type/nullability. Don't trust a hand-written schema doc over this file.
- **The project's `tsconfig.json`** `paths` entry for `@/*` — 19_spotify-clone maps `@/* → ./*`;
  26_hot-delivery maps `@/* → ./app/*`. Every `@/...` import in the copied files must resolve
  under the target project's actual mapping, or the build fails with a module-not-found error
  before any logic even runs (this was hot-delivery's first bug).
- **The service-role Supabase client** (e.g. `libs/supabaseAdmin.ts`) and **the route-handler auth
  helper** (e.g. `libs/supabaseServer.ts` or however the project gets a session in a route
  handler) — `requireUser.ts` calls into whatever this project's actual pattern is; check for an
  existing `createRouteHandlerClient(...)` call elsewhere in the project's API routes and match
  its exact import path and call signature, don't assume it matches another project's wrapper.
- **Any existing public-URL helper** (e.g. `getSupabasePublicUrl` / `getPublicUrl`) — reuse it if
  one already exists instead of duplicating the formula in `backupConfig.ts`.

### 5. Verify

- `npx tsc --noEmit` from the target project's own root (not a parent directory — a nested
  project inside another repo will otherwise get swept into the wrong tsconfig and report false
  cross-project errors).
- Export tables, inspect one CSV, re-import, confirm array/jsonb columns round-trip unchanged.
- Export files, re-import into an empty bucket, confirm files reappear and render/play correctly.
- Try the access boundary with a caller who should be denied (wrong role, or another user's data)
  and confirm they're skipped/rejected, not silently allowed.

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
strings; PostgREST coerces most of them to the real column type on upsert (timestamp / uuid / enum
/ bool). Three kinds need explicit coercion, declared per-table in `backupConfig.ts` and applied
client-side by `coerceRowsForImport()` in `BackupSDK.ts` before each POST: **numeric** columns
(`id`, `size_bytes`, `song_id`, `position`) become real numbers; **array** (`text[]`) and **jsonb**
columns are `JSON.parse`d back from the JSON text `toCsv()` wrote them as. None of this project's
four backup tables has an array or jsonb column, so that path is exercised only by
`26_hot-delivery`'s port (`food_live.images`/`ingredients`) — see [Porting this feature](#porting-this-feature-into-another-project-sop).

<br/>

## Where the code lives

Split by **runtime**: everything that runs in the browser (or is pure and browser-safe) lives under
`app/features/backup/`; only the server route handlers live under `app/api/backup/`.

```
app/features/backup/            ← all client + pure code, plus this doc
├── backupConfig.ts             ★ THE ONLY PROJECT-SPECIFIC FILE — tables, buckets, column
│                                 coercion rules, access boundary, file listing/ownership, public
│                                 URL builder. Porting to a new project = rewriting only this file.
├── BackupSDK.ts                browser orchestration: exportTables / importTables /
│                                 exportFiles / importFiles / downloadBlob / coerceRowsForImport
├── useDbBackup.ts              hook: all export/import state, progress, stall watchdog, start* actions
├── useDbBackupModal.ts         Zustand store: isOpen / onOpen / onClose
├── DbBackupModal.tsx           modal UI (render-only; imports ModalContainer, self-contained)
├── ModalContainer.tsx          copy-pastable modal shell (framer-motion, no Dialog.Root dependency)
├── tarClient.ts                pure tar build/parse + browser gzip (CompressionStream) and
│                                 gunzip (DecompressionStream) — no Node deps, never edit per-project
├── csvClient.ts                pure CSV read/write, RFC 4180 — no Node deps, never edit per-project
├── backupTables.ts             re-export shim: re-exports backupConfig.ts's constants/functions +
│                                 tarClient.ts's archive helpers from one stable import path
└── dev_readme-backup.md        this file

app/api/backup/                 ← server route handlers only, generic — never edit per-project
├── requireUser.ts              auth gate — 401 if no session, returns { userId } (may need a small
│                                 edit per project — see the SOP's "files to request", item 3)
├── rows/route.ts               GET → { tables };  POST { table, rows } → upsert one table,
│                                 calling backupConfig.ts's assertBackupAccess/scopeSelect/scopeRows
└── files/route.ts              GET → { files };   POST { files:[{bucket,path}] } → signed upload
                                  URLs, calling backupConfig.ts's assertBackupAccess/listFiles/isOwnedFile
```

There is **no server-only module in this folder** — the archive is decompressed in the browser, so
every file here is safe to import from the client. `backupConfig.ts` is the one file every port
rewrites; see [Porting this feature](#porting-this-feature-into-another-project-sop) above.

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
GET /api/backup/files → { files: [{ bucket, path, contentType }, ...] }
```

The server's file list comes from `backupConfig.ts`'s `listFiles()` (in this project: every
`song_path`/`image_path` on the caller's own `19_songs` rows). The browser downloads each file
**directly from Supabase's public CDN** (`getPublicUrl()`, concurrency pool of 5), packs
`storage/<bucket>/<path>` entries plus `storage-content-types.json`, gzips locally →
`19_backup-files-<date>.tar.gz`. The Vercel function returns only the path list. `includeImages`
(the modal's "Include cover images" checkbox) is applied client-side by filtering the `images`
bucket out of the list — the server always returns the full list, since it never changes per
request.

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
upload URLs and never receives a byte of the archive. The "owned-path check" below is
`backupConfig.ts`'s `isOwnedFile()` — in this project that means "is this path one of the caller's
own `19_songs.song_path`/`image_path` values"; a role-gated project like `26_hot-delivery` instead
checks bucket membership only (see [Porting this feature](#porting-this-feature-into-another-project-sop)).

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

- Both routes are gated by `requireUser()` (`libs/supabaseServer.ts`, async `cookies()` wrapper),
  then by `backupConfig.ts`'s `assertBackupAccess()` — in this project always `true` for any
  authenticated user, because the real boundary is per-row/per-file scoping below (a role-gated
  project like `26_hot-delivery` puts the whole boundary in `assertBackupAccess` instead).
- Reads use each table's `scopeSelect()`: `.eq("user_id", userId)` for most tables;
  `19_playlist_songs` is further filtered to the user's own playlist IDs.
- **Import ownership is the security boundary.** The server uses `supabaseAdmin` (service role), so
  RLS does not apply — the scoping in `backupConfig.ts` is what prevents one user from writing
  another's data:
  - Rows are filtered by each table's `scopeRows()` — a foreign `user_id` row is skipped on upsert.
  - A file gets a signed upload URL **only** if `isOwnedFile()` returns true — in this project, only
    if its path is in one of the user's own `19_songs` rows. The browser's file list is untrusted;
    the server decides what may be written. (This is also why tables must be imported before files.)

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

**`backupTables.ts`** — re-exports the pure tar helpers from `tarClient.ts` plus everything from
`backupConfig.ts` (`BACKUP_TABLES`, `BACKUP_BUCKETS`, `assertBackupAccess`, `listFiles`,
`isOwnedFile`, `getPublicUrl`, types), so the routes import from one stable path regardless of
which file actually defines each export.

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

10. **Porting to `26_hot-delivery` by copy-pasting the feature with `BACKUP_TABLES` /
    `BACKUP_BUCKETS` / the ownership checks still hardcoded to spotify's schema.** The copy built on
    the wrong path alias (`@/app/features/...` under a `@/* → ./app/*` project resolves to
    `./app/app/features/...`) and, even with imports fixed, would have backed up nothing — hot
    delivery has no `19_songs` table, no `user_id` scoping, and different bucket names. **Fixed by
    extracting every project-specific fact into `backupConfig.ts`** (tables, buckets, column
    coercion, `assertBackupAccess`, `listFiles`/`isOwnedFile`, `getPublicUrl`) so the routes and
    `BackupSDK.ts` became generic, config-driven code — verified by retrofitting this project onto
    the same `backupConfig.ts` shape with zero behavior change. Two schema bugs were caught only by
    cross-checking the hand-written config against the generated `types_db.ts`, not the markdown
    schema doc: hot-delivery's role column is `users.roles` (plural), not `role`; and this
    project's `19_liked_songs` has no `id` column at all (composite PK `user_id,song_id`) — both
    would have silently broken in production had the config been trusted without that check. See
    [Porting this feature](#porting-this-feature-into-another-project-sop) at the top of this doc.

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
