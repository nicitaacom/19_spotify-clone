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
| `app/api/backup/backupTables.ts` | Pure-JS tar.gz builder/parser (Node `zlib` only, no npm deps) |
| `app/api/backup/requireUser.ts` | Auth gate — 401 if no session, returns `{ userId }` |
| `app/api/backup/export/route.ts` | `GET` streams NDJSON progress → emits a one-time token; `POST { token }` returns raw `.tar.gz` binary |
| `app/api/backup/import/route.ts` | `POST` — raw `.tar.gz` body, upserts rows + re-uploads files |
| `app/sdk/BackupSDK.ts` | Client helpers: `exportWithProgress`, `importArchive`, `downloadBlob` |
| `hooks/useDbBackupModal.ts` | Zustand store: `isOpen / onOpen / onClose` |
| `hooks/useDbBackup.ts` | All export/import state and progress |
| `components/DbBackupModal.tsx` | Modal UI |

<br/>

## Export flow

### Step 1 — Manifest (pre-flight)

```
GET /api/backup/manifest?includeImages=true
→ { fileCount, totalBytes, estimatedMs, shouldSplit, splitIdx }
```

Fetches real byte sizes from Supabase Storage, estimates download time at ~8 MB/s + 40 ms/file overhead. If the estimate exceeds 50 s (`SPLIT_THRESHOLD_MS`), `shouldSplit: true` and an initial `splitIdx` (rough first-chunk size guess) are returned.

### Step 2 — Dynamic chunking

Each chunk is two HTTP requests — an NDJSON stream for progress, then a binary fetch for the file:

```
GET /api/backup/export?includeImages=true[&from=N&to=M&chunk=K&includeTables=false]

  {"type":"progress","done":1,"total":57}
  ...
  {"type":"timing","elapsedMs":42300,"filesProcessed":57}   ← real wall time
  {"type":"done","fileName":"19_backup-2026-06-19-part1.tar.gz","token":"..."}

POST /api/backup/export  { token }
  → raw application/gzip binary → browser downloads
```

After each chunk completes, the `timing` event tells the client the **actual** elapsed milliseconds and how many files were processed. The client divides to get real `ms/file`, then computes how many files the next chunk can safely process within the 55 s budget (`BUDGET_MS`):

```
msPerFile      = elapsedMs / filesProcessed   // measured from last chunk
nextChunkSize  = floor(55_000 / msPerFile)    // files the next chunk can handle
```

This means chunk sizes adapt to real Supabase Storage throughput — a user on a slow connection automatically gets smaller chunks; a fast connection may finish in a single chunk even if the manifest predicted a split.

Chunks run **sequentially** — progress resets between each one, the button label shows "Exporting part N…"

**Chunk 1** = all 4 table JSON files + `storage-content-types.json` + files `[0, splitIdx)`
**Chunk 2+** = files `[from, to)` only — no JSON (chunk 1 already has them)

Progress is counted in **files** (tables + storage objects), not bytes.

<br/>

## Import flow

**Import one or both archives** — if the export split into two parts, import both (order doesn't matter, results are merged in the UI). Upload a single `19_backup-<date>.tar.gz` from the import section.

Import behavior is **append + override on conflict** — nothing is ever deleted:

| What | Behavior |
| --- | --- |
| Row already exists (same PK) | **Overwritten** with backup values |
| Row is new | **Inserted** |
| Row not in backup | **Untouched** — stays as-is |
| Storage file already exists | **Overwritten** at the same path |
| Storage file is new | **Uploaded** |
| Storage file not in backup | **Untouched** |

The JSON files inside the archive are the restore source for tables. `storage-content-types.json` tells the import route what MIME type to use when re-uploading each file — without it files would be uploaded as `application/octet-stream`.

<br/>

## Security

- Every route is gated by `requireUser()` — uses `libs/supabaseServer.ts` (async `cookies()` wrapper, required by Next.js 15).
- Export: all DB queries are `.eq("user_id", userId)`. `19_playlist_songs` is further filtered to playlist IDs owned by the user.
- Import: rows whose `user_id` ≠ session user are silently skipped. Storage files are only restored if the path exists in the user's own `19_songs` rows.
- Server uses `supabaseAdmin` (service role) so RLS does not interfere — user-ID scoping in application code is the security boundary.

<br/>

## tar.gz implementation

No external package — built with Node's built-in `zlib` module only. Tar logic lives in `backupTables.ts`:

- `buildTarHeader()` — 512-byte POSIX ustar header with checksum
- `buildLongNameEntry()` — GNU `././@LongLink` extension for entry names > 100 chars
- `addTarEntry(chunks, name, data)` — appends header + data + padding to a `Buffer[]`
- `finalizeTar(chunks)` — concatenates + two 512-byte zero end-of-archive blocks
- `parseTar(buf)` — reads entries back; handles GNU long-name extension
- `gzipBuffer / gunzipBuffer` — `zlib.gzip` / `zlib.gunzip` promisified

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
