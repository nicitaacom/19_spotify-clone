# plan-24 — Backup parity: a per-user Storage folder that survives a cross-project restore

## 0. Why this exists

Ported from `23_store`'s `plan-22`, which fixed two bugs in that project's backup/restore. Reading
this repo end to end, **only one of the two applies here** — and the other one was already solved,
two commits ago, in a way this plan must not undo.

**Bug 1 — already fixed, do not rebuild it.** Commit `a226903 fix: restore backups across projects`
landed the owner remap. `remapRowsToCurrentUser` in
[app/features/backup/backupOwnership.ts:3](../app/features/backup/backupOwnership.ts) rewrites every
imported row's `user_id` to whoever is signed in at import time. The server does not list Auth
accounts and does not create them — the live session already shows that the project-B account
exists. That reasoning is written down in
[app/features/backup/dev_readme-backup.md:160](../app/features/backup/dev_readme-backup.md),
"Cross-project owner mapping". There is no `auth-users` route here and there should not be one.

**Bug 2 — real, and shaped differently than in `23_store`.** The image path is not the problem: it is
stored on the row itself (`19_songs.song_path` and `image_path`,
[app/features/backup/backupConfig.ts:135](../app/features/backup/backupConfig.ts)), so it round-trips
through the CSV without needing a rewrite. That is also why relinking was deliberately decided
against here — [dev_readme-backup.md:181](../app/features/backup/dev_readme-backup.md), "Why Storage
URL relinking is not used here".

The problem is **what the folder is keyed on**.
[app/api/songs/route.ts:33](../app/api/songs/route.ts) builds both paths with
`getSafeStoragePath({ ..., folder: playlistSlug ?? undefined })`. The folder is the **playlist
slug** — a name the user typed, not anything tied to the user. Two people with a playlist called
`chill` write into the same `chill/` folder. The only thing keeping their files apart is the
`uniqid()` in the filename ([app/api/songs/route.ts:32](../app/api/songs/route.ts)).

That collides with the ownership check the same commit added. `isOwnedFile`
([backupConfig.ts:161](../app/features/backup/backupConfig.ts)) refuses to issue a signed upload URL
unless *every* row referencing that exact path belongs to the caller, via
`isFilePathOwnedExclusively` ([backupOwnership.ts:37](../app/features/backup/backupOwnership.ts)).
So a shared folder never overwrites anyone's data — it makes a real restore silently skip files
instead. The fix is a folder key that is per-user by construction.

**One more gap found while reading:** `19_playlists.cover_image_path` is read in two screens —
[app/(site)/playlists/components/PlaylistCard.tsx:14](<../app/(site)/playlists/components/PlaylistCard.tsx>)
and
[app/(site)/playlists/[slug]/page.tsx:37](<../app/(site)/playlists/[slug]/page.tsx>) — but it has no
upload call site anywhere in the repo, and it is absent from `BACKUP_STORAGE_PATHS`
([backupConfig.ts:135](../app/features/backup/backupConfig.ts)). Playlist covers are never backed up.

> **Priority:** P2 — lower than `23_store`'s `plan-22` and this repo's own `26`-style port, because
> the account-remap half is already shipped and working
> **Screenshot:** none — diagnosed by reading the code, every claim above anchored to a file and line
> **Recommended model:** Opus · high thinking
> **Status:** 🔴 Parked — blocked on the four answers in §1. No code written yet, on purpose.

---

## 1. Open questions — answer before any build step runs

Nothing in §4 starts until these four are answered. Each option is written so the answer can be a
single number.

### Q1 — the per-user folder shape

**1️⃣ Slugified email, then the playlist slug under it** — `nicitaacomgmailcom/chill/song-…mp3`. The
`plan-22` key. An email does not move when a uuid is rewritten, so the folder survives the remap that
`a226903` already performs.

**2️⃣ The `user_id`, then the playlist slug** — `f3a2…/chill/song-…mp3`.
⚠️ `user_id` is precisely what `remapRowsToCurrentUser`
([backupOwnership.ts:3](../app/features/backup/backupOwnership.ts)) rewrites on every import, so the
folder name goes stale the moment it is restored — the bug this plan exists to remove.

### Q2 — what happens to commit `a226903`

**1️⃣ Build on it** — keep the re-own-to-importer model exactly as it stands, add only the folder
rework and a path rewrite on import so a restored row's `song_path` points at the new folder.

**2️⃣ Replace it with `23_store`'s model** that creates project-B accounts.
⚠️ Argues with what `a226903` deliberately set out to do, and
[dev_readme-backup.md:164](../app/features/backup/dev_readme-backup.md) records the reasoning against
listing or creating Auth accounts.

### Q3 — files already sitting at the old paths

**1️⃣ New scheme in code only, one manual move by you** — the same call made in `plan-22` §1, where
the old folders were renamed by hand once and the code was never taught the old shape.

**2️⃣ Ship a migration** that rewrites `song_path` and `image_path` on every row and moves the objects.
⚠️ More code, run once, then never called again — and a half-finished move leaves rows pointing at
files that are no longer there.

### Q4 — playlist covers

**1️⃣ In scope** — add `cover_image_path` to `BACKUP_STORAGE_PATHS`, and find or build the upload step
that is missing, so the column stops being written by nothing and read by two screens.

**2️⃣ Out of scope** — leave covers alone, write the gap into §4 as a known limit.
⚠️ A restored playlist keeps rendering the fallback `/images/liked.png` forever.

---

### Confirmed by reading the code — not open, do not re-litigate

- The four backed-up tables are `19_songs`, `19_liked_songs`, `19_playlists`, `19_playlist_songs`
  ([backupConfig.ts:67](../app/features/backup/backupConfig.ts)). There is no `19_users` table and
  none of the four needs one — stated at
  [dev_readme-backup.md:165](../app/features/backup/dev_readme-backup.md).
- Every table is per-user scoped on both sides: `scopeSelect` on export, `scopeRows` on import
  ([backupConfig.ts:74](../app/features/backup/backupConfig.ts) onward). `assertBackupAccess`
  ([backupConfig.ts:174](../app/features/backup/backupConfig.ts)) returns true for everyone on
  purpose — the row scoping is the whole boundary.
- The two buckets are `songs` and `images`
  ([backupConfig.ts:121](../app/features/backup/backupConfig.ts)).
- A slug helper already exists and already transliterates Cyrillic —
  `CYRILLIC_TO_LATIN_MAP` and `slugifyFilePart` in [libs/helpers.ts:29](../libs/helpers.ts), used by
  `getSafeStoragePath` at [libs/helpers.ts:92](../libs/helpers.ts). Q1's folder key should reuse it,
  not add a second slug function.
- Public URLs are rebuilt from project B at render time via `buildSupabasePublicUrl`
  ([libs/supabasePublicUrl.ts](../libs/supabasePublicUrl.ts)), which is why a hostname change needs
  no row rewrite.

---

## 2. Code patterns to follow

This repo has no `CLAUDE.md`. The conventions live in
[app/features/backup/dev_readme-backup.md](../app/features/backup/dev_readme-backup.md) — read its
"Porting this feature into another project (SOP)" section at line 12 and its "Failed iterations
(don't redo these)" section at line 466 before writing anything, so this plan does not repeat a
route already tried and rejected.

| File | Behavior today | Behavior after this plan |
| --- | --- | --- |
| `app/api/songs/route.ts` | folder is the playlist slug ([:33](../app/api/songs/route.ts)), files kept apart only by `uniqid()` ([:32](../app/api/songs/route.ts)) | folder is per-user, per Q1, with the playlist slug kept underneath |
| `libs/helpers.ts` | `getSafeStoragePath` takes a flat `folder?: string` ([:92](../libs/helpers.ts)) | takes the owner key as well, so no call site can build a path without one |
| `app/features/backup/backupConfig.ts` | `BACKUP_STORAGE_PATHS` covers `song_path` and `image_path` ([:135](../app/features/backup/backupConfig.ts)) | plus `cover_image_path`, per Q4 |
| `app/features/backup/backupOwnership.ts` | remaps `user_id` only ([:3](../app/features/backup/backupOwnership.ts)) | also rewrites the owner segment of `song_path` / `image_path`, per Q2 |
| `app/features/backup/backupOwnership.test.mjs` | 5 tests, run by `pnpm test:backup` | gains cases for the path rewrite and the per-user folder |
| `app/features/backup/dev_readme-backup.md` | "Cross-project owner mapping" ([:160](../app/features/backup/dev_readme-backup.md)) describes the row remap only | also describes the folder key and why it holds |

---

## 3. Terminology

- **Owner key** — the per-user segment at the front of a Storage path. Which value it is gets decided
  by Q1.
- **Re-own** — what `a226903` already does: rewriting an imported row's `user_id` to the signed-in
  importer, rather than recreating the original account.
- **Path rewrite** — the new step this plan adds: rewriting the owner segment inside `song_path` and
  `image_path` at import time, so the row and the file agree on where the file lives.
- **Relink** — `23_store`'s approach of recomputing a path and matching it against Storage. Decided
  against in this repo at
  [dev_readme-backup.md:181](../app/features/backup/dev_readme-backup.md) and staying that way.
- **Project A / project B** — the Supabase project a backup was taken from, and the one it is
  restored into.

---

## 4. How it should work

**Storage tree today** — from [app/api/songs/route.ts:33](../app/api/songs/route.ts):

```
songs/
└── chill/                              the playlist slug — two users, one folder
    ├── song-lofi-beat-mgk3x1.mp3       kept apart only by uniqid()
    └── song-lofi-beat-mgk9z7.mp3       ← a different person's file, same folder

images/
└── chill/
    └── image-lofi-beat-mgk3x1.jpg
```

**Storage tree after** — owner key decided by Q1:

```
songs/
└── <owner key from Q1>/
    └── chill/
        └── song-lofi-beat-mgk3x1.mp3

images/
└── <owner key from Q1>/
    └── chill/
        ├── image-lofi-beat-mgk3x1.jpg
        └── cover-chill-mgk3x1.jpg      only if Q4 is answered 1️⃣
```

**Why a restore stops skipping files:**

```
project A: the row's song_path is chill/song-lofi-beat-mgk3x1.mp3
        │
        ▼
imported into project B, re-owned to the signed-in importer (a226903, already shipped)
        │
        ▼
isOwnedFile asks: does every row pointing at this exact path belong to the caller?
        │
        ▼
today: another user's row in project B already sits at chill/... → answer is no
        │                                    → the signed upload URL is refused
        │                                    → the file is skipped, quietly
        ▼
after: the path starts with the owner key, so no two people ever share one
        │
        ▼
the answer is always yes for the caller's own files → the restore completes
```

### Build order

One commit per task. Mark each `[x]` here as it lands.

🔴 **Gate — every task below is blocked until §1's four questions are answered.**

- [ ] 1. Extend `getSafeStoragePath` in `libs/helpers.ts` to take the owner key, reusing the existing
      `slugifyFilePart`. Do not add a second slug function.
- [ ] 2. Pass the owner key from `app/api/songs/route.ts` for both the song and the image upload.
- [ ] 3. Add the import-time path rewrite to `app/features/backup/backupOwnership.ts`, per Q2, so a
      restored row's `song_path` and `image_path` start with the importer's own owner key.
- [ ] 4. Widen `BACKUP_STORAGE_PATHS` and `listFiles` per Q4.
- [ ] 5. Cover the delete paths too — `app/api/songs/[id]/delete/route.ts:34` and
      `app/(site)/my-songs/components/MySongsContent.tsx:43` both remove by the stored path, so they
      keep working, but they need a test that says so.
- [ ] 6. Add test cases to `app/features/backup/backupOwnership.test.mjs` for the path rewrite and for
      two users with the same playlist slug no longer colliding.
- [ ] 7. Write the folder key and its reasoning into
      `app/features/backup/dev_readme-backup.md`, directly under "Cross-project owner mapping" at line
      160, and redraw the tree in "Playlist folders in Storage" at line 547 to match what shipped.
- [ ] 8. `pnpm lint`, `pnpm type-check` and `pnpm test:backup` all clean, then `pnpm build`.

🚨 TODO
1. Answer the four questions in §1 — reply in this chat with four numbers, e.g. `1 1 1 2`. Nothing in
   the build order starts before that; the plan is parked until then.
2. Q3 answered 1️⃣ means one manual move in the Supabase Storage browser afterwards: rename each
   existing top-level folder in the `songs` and `images` buckets so it sits under the owner key. The
   exact folder list comes from the build, so this stays parked until the plan is unblocked.
