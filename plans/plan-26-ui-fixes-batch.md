# plan-26 — UI fixes batch: player keys, Add-a-song modal, modals, playlists, song suggestions

## 0. Why this exists

20 screenshots in `TODO/` (the folder is temporary and gitignored, so **never commit it**), each one
its own bug or ask. They are merged into one plan here so one executor can work through them in order
without reading the same files four times. **Each screenshot is its own commit**, named per
[commit-patterns.md](../commit-patterns.md).

> **🔥 Priority:** P1 — my guess, not yet confirmed: polish on music.jokik.fi, which does not move
> outreach. Change it if that is wrong.
> **Screenshot:** one per task, listed on each task below (all in `TODO/`)
> **Recommended model:** Fable · high thinking
> **Status:** 🟢 Unblocked — no open questions. Where a choice had to be made it is written down
> under the task as **Decided**, so it can be changed before that task runs.

---

## 1. Rules for whoever runs this

1. **One task = one commit, then stop and wait for review** —
   [AI_readme_code-sytle-patterns.md](../AI_readme_code-sytle-patterns.md) "When generating new code"
   rule 11. Mark the task `[x]` in the build order inside the same commit.
2. **At most 6 commits per chat.** The build order is already split into 4 chats. Open a new chat for
   the next batch instead of adding a 7th commit.
3. **Commit messages** follow [commit-patterns.md](../commit-patterns.md): `type: message`, the subject
   is 12-40 characters, lowercase, no scope, no trailing period. A description is required. Use a
   `🚨 TODO` block only for steps the AI has no way to do itself (tasks 18 and 19 have SQL, and the
   SQL goes **in the body**). **Never** add a co-author trailer. The subjects below are already
   checked against the 40-character limit.
4. **Before each commit:** `pnpm lint` and `pnpm type-check` must be clean. Task 20 also needs
   `pnpm test:backup`. Write the results into the body as facts (`- tsc and lint clean`).
5. **Errors:** rule 15 of the style guide. Always show the error message, cause and name. Never write
   "something went wrong", "upload failed" or "try again" without the real reason.
6. **Words:** the no-jargon wording section and its banned-word list in the style guide apply to
   code, comments and docs.
7. **UI:** follow [dev_readme-ui.md](../dev_readme-ui.md) (Neon Design System: `neon`, `surface`,
   `elevated`, glow shadows, compact paddings).
8. **This repo is poorly documented.** Each task names the `dev_readme-*.md` to create or update.
   Do that in the same commit as the code.

---

## 2. Confirmed by reading the code — do not re-check

- **ADMIN = the site owner.** On the server: `isOwnerId(userId)` in `libs/getOwnerIds.ts:12`. In the
  browser: `useOwnerStore().isOwner`. `OWNER_IDS_ARR` is a **server-only** env var
  (`libs/getIsOwner.ts:4`), so `isOwnerId()` called in a client component always returns `false`.
  `components/EditSongModal.tsx` is the only client file that does that (task 13).
- **Player:** `components/PlayerContent.tsx` plays through `use-sound` (Howler) with `html5: true`
  (`:295-300`), so the real `<audio>` element is Howler's own and is not in the DOM.
  `components/Player.tsx:56-83` handles Space / Escape / F8 on `window`. The queue and playback
  commands live in `hooks/usePlayer.ts`.
- **Song rows** are `components/MediaItem.tsx` (`role="button" tabIndex={0}` at `:46-48`), used in
  playlist rows (`app/(site)/playlists/components/PlaylistDetailContent.tsx:122`) and in the sidebar
  (`components/Library.tsx:56`). Grid cards are `components/SongItem.tsx` (`tabIndex={0}` at `:45`).
- **Modals:** `components/Modal.tsx` (Radix Dialog, no animation) is used by AddASongModal,
  AddToPlaylistModal, AuthModal, CreatePlaylistModal, EditSongModal, SubscribeModal,
  PlaylistDetailContent and PlaylistEditor. `components/AnimatedSearchModalShell.tsx` is a second,
  already-animated copy that only SearchModal uses. `app/features/backup/ModalContainer.tsx` (used by
  DbBackupModal and AreYouSureModal) already animates with framer-motion. `framer-motion` ^12 is
  installed.
- **Playlist cover:** `cover_image_path` is **not** a column. `actions/playlists.ts:213` and `:437`
  take the first song's image. `19_playlists` columns are listed in `app/interfaces/types_db.ts:83`.
- **YouTube link:** stored in `19_playlist_commerce.youtube_url`
  (`dev_readme-supabase-sql.md:401`). It is only sent to the playlist's manager or a buyer
  (`libs/playlistAccess.ts:220`). Keep that rule.
- **Audio conversion already exists:** `libs/songUpload.ts` decodes with `decodeAudioData` and encodes
  to 128 kbps MP3 with lamejs (`app/(site)/slow-and-reverb/lib/encodeMp3`). Today it is only used for
  `.m4a` and oversized `.mp3`.
- **Uncommitted work already in the tree** (not from this plan): `components/SongTagsInput.tsx:81`
  caps the tags box at `max-h-[4.5rem]` with its own scroll, and `components/AddASongModal.tsx:665-666`
  undoes the absolute-position scroll wrapper from `08892e3`. Both belong to the modal-height fix and
  ship with **task 5**.

---

## 3. Terminology

- **Admin** — the site owner (see "Confirmed by reading the code"). The screenshots use the word ADMIN.
- **Source playlist** — the playlist a queue was started from. New in task 4, stored in `usePlayer`.
- **Top tags** — the tags used most on a playlist's last 8 added songs (task 7).
- **Suggestion** — a non-admin's proposed title, author or tags for a song, waiting for the admin to
  approve or reject it (task 19).

---

## 4. Build order

### Chat 1 — player and keyboard

- [x] **1. Headphone pause leaves the pause icon showing** — `28.09.2026 at 13-54.jpg`
  `fix: headphone pause updates play icon`
  - **Cause:** `PlayerContent.tsx:417-421` registers no `mediaSession` `play` or `pause` handler, so the
    browser's default action pauses Howler's `<audio>` element directly. Howler is never told: its
    `onpause` (`:313`) does not fire, `isPlaying` stays `true`, and `sound.playing()` stays `true`. The
    next click on Play then returns early at `playSound` `:100`, so it takes two clicks.
  - **Change:**
    1. Register `navigator.mediaSession.setActionHandler("play" | "pause", …)` next to the existing
       handlers (`:425`). They call `usePlayer.getState().requestPlaybackCommand("play" | "pause")`,
       the same path as the Play button. Remove them in the cleanup (`:435`). The old comment at
       `:418-421` worries this would double-trigger with keydown handlers in `Player.tsx`. That is no
       longer true, because `Player.tsx:56-83` handles only Space, Escape and F8. Rewrite the comment.
    2. Set `navigator.mediaSession.playbackState` to `"playing"` in `onplay` and `"paused"` in `onpause`
       so the OS media overlay shows the right state.
    3. Fallback for pauses that send no media action (Bluetooth disconnect, Android audio focus): in
       `bindNativeAudioListeners` (`:147`) add a native `pause` listener. When the element is paused
       but Howler still reports playing, and neither `isRecoveringRef` nor `isBufferingRef` is set
       (stall recovery pauses on purpose at `:204-207`), call
       `soundRef.current?.pause(activeSoundIdRef.current ?? undefined)`. That makes Howler's own
       `onpause` update the state. Detach it in `detachNativeAudioListeners` (`:137`).
  - **Check:** play a song. Pause and resume it from Chrome's toolbar media controls (same path as
    headphones). The icon follows every time, and one click on Play resumes.
  - **Docs:** `dev_readme-player.md` → new "Bug: headphone pause leaves the pause icon" section under
    "Bug fixes".

- [x] **2. Space plays the clicked row instead of pausing** — `28.09.2026 at 14-33.jpg` (also the phone
  shots `Screenshot_20261018-174627.png` / `-181550.png`, white focus ring)
  `fix: space no longer plays clicked row`
  - **Cause:** a click focuses the `role="button"` row. Space then runs the row's own `onKeyDown`
    (`MediaItem.tsx:51`), which plays that row's song, and `Player.tsx:68` toggles playback too.
  - **Change:** as asked, `tabIndex={-1}` on `MediaItem.tsx:48` and `SongItem.tsx:45`. **Also remove
    the Enter/Space `onKeyDown`** in both (`MediaItem.tsx:51`, `SongItem.tsx:35-40,47`). A mouse click
    still focuses a `tabIndex={-1}` element, so the handler would keep firing. Add `outline-none` to
    the `MediaItem` row so the phone focus ring goes away. If a jsx-a11y rule complains about
    `role="button"` without a key handler, keep the role and disable that one rule on that line with
    the reason.
  - **Check:** click a playlist row, click elsewhere, press Space. The current song pauses and resumes,
    and no other song starts.
  - **Docs:** `dev_readme-player.md` "Keyboard shortcuts (Player.tsx)" → one line: song rows are not
    focusable on purpose.

- [x] **3. Arrow keys: ±5 s, Shift+Arrow next/previous** — `28.09.2026 at 16-29.jpg`
  `feat: arrow keys seek and switch songs`
  - **Change:**
    - `components/PlayerContent.tsx`: 4 `useHotkey` calls (`hooks/useHotkey.ts`) with
      `ignoreInputs: true`:
      - `ArrowRight` → `+5 s`, `ArrowLeft` → `-5 s`. Clamp to `0..sound.duration()`, then
        `seekCurrentSound(position)`, `setSavedPosition(position)` and `setProgress(position / duration)`,
        the same 3 calls as the seek effect at `:493-496`.
      - `ArrowRight` + `modifiers: ["shift"]` → `onPlayNext`, `ArrowLeft` + `["shift"]` →
        `onPlayPrevious`.
      - `useHotkey` already rejects extra modifiers (`:118-121`), so the arrow alone and Shift+arrow
        never both fire.
    - `hooks/useHotkey.ts:86-88`: also skip `ALWAYS_SKIP_IN_INPUTS` keys when the focused element has
      `role="slider"`. The volume slider uses ArrowLeft/Right, and `useHotkey` listens in the capture
      phase, so it would otherwise run first. The playlist reorder handle uses only ArrowUp/Down
      (`PlaylistDetailContent.tsx:111`), so there is no clash there.
  - **Check:** while a song plays, → / ← jump 5 s and the progress bar follows. Shift+→ / Shift+←
    change the song. With the volume slider focused, ← / → change only the volume.
  - **Docs:** `dev_readme-player.md` "Keyboard shortcuts" table → 4 new rows.

- [x] **4. Show which playlist is playing, and a stronger hover** — `28.09.2026 at 16-34_1.jpg`
  `upd: glow on the playing playlist card`
  - **Asked:** a barely visible animation on the card of the playlist that is playing now, plus a
    stronger hover on `PlaylistCard` (the class string in the ask is
    `app/(site)/playlists/components/PlaylistCard.tsx:22`) and on `components/SongItem.tsx:49-52`.
  - **Change:**
    - `hooks/usePlayer.ts`: add `sourcePlaylistId?: string`. `startPlayback(id, songs, playlistId?)`
      sets it (keep the old value when `songs` is not passed), and `reset` clears it.
      `hooks/useOnPlay.ts:42` passes its `playlistId`.
    - `tailwind.config.ts:25-33`: new keyframe `playing-glow`. Border color goes from `neon/15` to
      `neon/35` with a faint shadow, 2.4 s ease-in-out infinite. It must be softer than the existing
      `pulse-glow`.
    - `PlaylistCard.tsx`: add `"use client"` (both of its parents are already client components). Read
      `sourcePlaylistId` and `isPlaying` from `usePlayer` and add `animate-playing-glow border-neon/25`
      while the card's playlist is the source and is playing. Hover becomes
      `hover:border-neon/40 hover:bg-elevated hover:shadow-neon-sm`.
    - `SongItem.tsx:51`: same hover values.
  - **Check:** start a playlist, go to Top Playlists. Only that card breathes, and only while it plays.
    Hovering any card is visible at a glance.
  - **Docs:** `dev_readme-ui.md` "Cards (SongItem, PlaylistCard)" → the new hover and the
    playing-glow rule.

### Chat 2 — Add a song modal (`components/AddASongModal.tsx`)

- [ ] **5. The upload progress bar changes the modal height** — `2026-10-18_at_10-51.jpg`
  `style: no modal jump while uploading`
  - **Starts from the 2 uncommitted edits** listed under "Confirmed by reading the code". Commit them
    with this task. Do this task first in this chat, before anything else touches these two files.
  - **Cause:** `AddASongModal.tsx:879` renders `<ProgressBar>` only while `isLoading`, which adds a new
    row above the Create button.
  - **Change:** show progress **inside the Create button**. The button gets `relative overflow-hidden`,
    a fill `div` (`absolute inset-y-0 left-0 bg-black/15`, `style={{ width: progress% }}`) sits behind
    the label, and the label reads `Uploading… 45% · 4.9 MB/s` (or `Preparing audio… 45%`). Remove
    the `<ProgressBar>` line. `components/ProgressBar.tsx` then has no users, so delete it.
  - **Check:** compare the modal's `offsetHeight` before, during and after an upload. All three must
    match.
  - **Docs:** new `dev_readme-add-song.md` covering the modal layout, the progress-in-button rule, and
    why the tags box has its own scroll.

- [ ] **6. "Select a song file" accepts a .jpg** — `2026-10-18_at_21-18.jpg`
  `fix: song file accepts audio only`
  - **Cause:** nothing checks the file when it is picked. `accept` (`:695`) is only a hint, since the
    file dialog's "All files" option bypasses it.
  - **Change:**
    - `:695` → `accept="audio/*"`. In `handleSongChange` (`:445`), reject a file when its type does not
      start with `audio/` **and** its extension is not one of `mp3 m4a wav flac ogg oga opus aac webm
      aif aiff`. Clear the input (`event.target.value = ""`, then `songInput.onChange(event)`) and show
      `"<file name>" is not an audio file. Pick an audio file (MP3, WAV, M4A, FLAC, OGG…).`
    - `libs/songUpload.ts:11-14`: accept the same list. Every non-mp3 file is converted
      (`needsEncoding = extension !== "mp3" || …`), and the output is always named `*.mp3`. The decode
      error at `:47` names the file and the browser's error (`${error.name}: ${error.message}`).
    - `app/api/songs/route.ts:47-49`: accept only `.mp3` with `audio/mpeg`, because the client always
      converts now. `:97` → `contentType: "audio/mpeg"`. Songs already stored as `.m4a` keep playing
      (`PlayerContent.tsx:297` still checks the extension).
    - Copy: the modal description `:637` becomes `Upload any audio file — it is stored as MP3`, and the
      error strings at `:537`, `:573` and `:662` drop "MP3 or M4A".
  - **Check:** a `.jpg` is refused and the input is empty again. A `.wav` uploads and the stored path
    ends in `.mp3`.
  - **Docs:** `dev_readme-add-song.md` → "Accepted audio and conversion".

- [ ] **7. Autofill only the most used tags** — `2026-10-18_at_21-13.jpg` (the first chat named it
  22-35, but the two labels were swapped)
  `fix: autofill only the most used tags`
  - **Cause:** `libs/songTags.ts:57` sets the share threshold to `1` when the playlist has 0-1 recent
    songs, so every tag of a single song is autofilled. `recent` (`:61`) lists **every** tag from the
    last 8 songs, which is the long badge row in the screenshot.
  - **Change:** `recentPlaylistTags` returns `{ autofill, top }`. `top` = the first 2 ranked tags.
    `autofill` = the tags in `top` that appear on **2 or more** of the last 8 songs. Rename `recent` →
    `top` in `hooks/usePlaylistRecentTags.ts` and `AddASongModal.tsx:124,141-143`. The label becomes
    `Most used on <playlist>`, the note becomes `Filled from your most used tags on <playlist>.`, and
    the button `Use recent tags` becomes `Use top tags`.
  - **Decided:** a tag used once is never autofilled. Playlist-name genre tags (`:122`) stay as the
    fallback.
  - **Check:** a playlist where only one song has tags autofills nothing from it. A playlist where
    `csgo` is on 5 of the last 8 autofills `csgo`, and the badge row shows at most 2 playlist tags.
  - **Docs:** `dev_readme-add-song.md` → "Tag autofill".

- [ ] **8. 3 lines of tag hints → 1** — `2026-10-18_at_17-38.jpg`
  `style: tag hints fit on one line`
  - **Change:** `components/SongTagsInput.tsx:96-108`. Merge the help line, `playlistNote` and the
    `playlistLabel` row into **one** row: left side `{count}/32 · {note or label}` (truncate), right
    side the `Use top tags` button. `Press Enter or comma to add a tag` moves into the input's
    placeholder (`Add a tag (Enter or comma)`) and `title`. Keep `id={`${id}-help`}` on the merged row
    so `aria-describedby` still works.
  - **Check:** under the tags box there is one line of text, then the badge row.

- [ ] **9. Remove the image format hint** — `2026-10-18_at_15-17.jpg`
  `style: drop image format hint`
  - **Change:** `AddASongModal.tsx:717-721`. Delete the `JPG, JPEG, PNG, WebP, or AVIF…` sentence.
    Keep `Embedded cover art found…` only when `embeddedImage` is set. Ctrl+V paste still works and
    is not mentioned anywhere.

- [ ] **10. Keep the modal open after an upload** — `2026-10-18_at_10-57.jpg`
  `fix: keep add song modal open`
  - **Change:** the success branch (`:613-625`):
    - Keep `uploadModal.onClose()` from being called. Reset title, author, song, image, isPaid,
      embedded cover, tags, `tagsCustomized` and `appliedSuggestionKey`.
    - **Keep `selectedPlaylist`**: the next song usually goes to the same playlist.
    - Bump a `uploadCount` state and use it in the `SongTagsInput` key (`:729`) so its draft clears.
      Pass it to `usePlaylistRecentTags` as a refetch key, since the new song changes the top tags.
    - Focus the title input. Call `resetTurnstileFn()` and roll the challenge again (`:197-200`).
    - `hasUnsavedSongChanges` (`:288`): treat the playlist of the last upload as unchanged, so closing
      right after an upload does not ask "discard changes?" when nothing was entered.
  - **Check:** upload a song. The modal stays open, the toast shows, the form is empty, the playlist is
    still selected, and the title has focus. Closing it right away does not ask to discard.
  - **Docs:** `dev_readme-add-song.md` → "After an upload".

### Chat 3 — errors, small modal fixes, sidebar, modal animation

- [ ] **11. Exact upload errors** — `2026-10-18_at_17-34.jpg`
  `fix: name the file when upload fails`
  - **Cause:** the file was moved or renamed after it was picked, so the browser could not read it.
    `xhr.onerror` (`:513`) has no details and rejects with `Upload failed`.
  - **Change:**
    - Before `uploadViaApi`, read 1 byte of the song and the image (`await file.slice(0, 1).arrayBuffer()`).
      If that throws, show his wording: `File "<name>" has been moved or renamed. Please pick the
      song/image again.`, naming which one. Do the same check at the start of `onSubmit`, before
      the slow audio conversion.
    - `:513`: `Upload of "<song name>" stopped: no response from the server (network error). Check
      the connection and send it again.` `:510`: include `xhr.status`, `xhr.statusText` and
      `body.error`. `:627` fallback: `${error.name}: ${error.message}`.
    - `getSongDuration` (`:474`): name the file.
    - `app/api/songs/route.ts`: `:26` `Forbidden` → `Only the site admin can upload songs.` `:44`
      `Missing required fields` → list the missing ones (`Missing: song file, title`). `:107` add
      `imageError.message`. Wrap the handler so an unexpected throw returns
      `{ error: "<name>: <message>" }` as JSON, never an HTML 500.
  - **Check:** pick a song, rename it on disk, press Create. The red message names that file and
    explains it was moved or renamed.

- [ ] **12. "Create new playlist" keeps the name already typed** — `2026-10-18_at_17-19.jpg`
  `fix: prefill new playlist with search`
  - **Change:**
    - `hooks/useCreatePlaylistModal.ts`: `onOpen({ skipRedirect, initialTitle })` stores
      `initialTitle`. Add `createdPlaylistId` with a setter.
    - `AddASongModal.tsx:765` passes `initialTitle: playlistSearch.trim()`.
    - `components/CreatePlaylistModal.tsx`: when it opens, copy `initialTitle` into `title` (render-time
      previous-value pattern, as at `AddASongModal.tsx:185-192`). After a successful create, set
      `createdPlaylistId` on **both** paths (owner `/api/playlists/manage` at `:63` and the normal
      insert below it).
    - `AddASongModal.tsx:251-260`: after the create modal closes, select `createdPlaylistId` and clear
      the search.
  - **Decided:** auto-selecting the new playlist is part of the same "never ask for what was already
    entered" rule, so it ships in this commit.
  - **Check:** type `kizaru 2` in the playlist search, then click Create new playlist. The title shows
    `kizaru 2`. Create it, and it is selected in the Add a song modal.

- [ ] **13. Tags are missing in Edit song** — `2026-10-18_at_14-14.jpg`
  `fix: show tags in edit song modal`
  - **Cause:** `components/EditSongModal.tsx:25` calls `isOwnerId()` in the browser, and that always
    returns `false` there (see "Confirmed by reading the code").
  - **Change:** `const { isOwner } = useOwnerStore()` and `canEditTags = isOwner`. The server already
    allows only the admin to change tags (`app/api/songs/[id]/route.ts:55`).
  - **Check:** as admin, open Edit song. The tags box shows the song's tags, and Save keeps them.

- [ ] **14. Sidebar library: admin gets an edit icon** — `2026-10-18_at_17-49.jpg`
  `upd: admin edits songs from library`
  - **Change:**
    - `components/Library.tsx:56-60`: when `isOwner`, render an edit button (`FiEdit2`, same size and
      tone as `AddToPlaylistButton`) that calls `useEditSongModal().onOpen(song, () => router.refresh())`.
      Everyone else keeps `AddToPlaylistButton`. Clicking the row still plays the song.
    - `components/EditSongModal.tsx`: when it opens, call `getUserSongPlaylists([song.id])`
      (`actions/playlists.ts:279`) and show `In playlists: A, B` (each one a link to
      `/playlists/<slug>`), plus a `+ Add to playlist` button that opens `useAddToPlaylistModal`. The
      admin still reaches add-to-playlist this way.
  - **Depends on task 13.**
  - **Check:** as admin, the sidebar shows pencils, and a pencil opens Edit song with the playlists
    listed. As a normal user, the sidebar still shows the add-to-playlist icon.

- [ ] **15. The library header scrolls away** — `2026-10-18_at_14-32.jpg`
  `style: keep library header visible`
  - **Cause:** `components/Sidebar.tsx:86` scrolls the whole `Library` (header, note and list) as one
    block, so the list slides over where the header was.
  - **Change:** `components/Library.tsx:37`: the header row gets
    `sticky top-0 z-10 bg-surface rounded-t-lg`. Fix the typo `Your libray` → `Your library` at `:40`.
  - **Check:** scroll the sidebar list. The header and its `+` stay on top, and no row shows above or
    under them.

- [ ] **16. Close animation for every modal** — `2026-10-18_at_18-09.jpg`
  `upd: animate every modal close`
  - **Asked:** "NO, FOR EVERY MODAL, fix pattern". Fix this once in the shared shell, not per modal.
  - **Change:**
    - `components/Modal.tsx`: use the `AnimatedSearchModalShell.tsx` approach. `AnimatePresence` wraps
      `{isOpen && <Dialog.Portal forceMount>…}`, and the Overlay and Content use `asChild forceMount`
      with `motion.div` (fade overlay; content fades and scales from 0.95, 0.2 s ease-out). Remove
      `translate-x-[-50%] translate-y-[-50%]` from the classes and pass `x: "-50%", y: "-50%"` to
      motion instead, otherwise the two transforms fight. Remove `defaultOpen`. New props:
      `onOpenAutoFocus` and `onExitComplete` (passed to `AnimatePresence`).
    - Callers that reset their form on close would show an empty form during the 0.2 s exit. Move
      those resets into `onExitComplete`: `AddASongModal.discardAndClose` (`:262`), `EditSongModal`
      `onChange` (`:36`), and `CreatePlaylistModal` `onChange` (`:45`).
    - `components/SearchModal.tsx` → use `Modal` (with `onOpenAutoFocus={event => event.preventDefault()}`).
      Then delete `components/AnimatedSearchModalShell.tsx`, so there is one shell.
    - `ModalContainer` (backup + AreYouSure) already animates. Leave it alone, since the backup README
      marks it copy-as-is.
  - **Check:** open and close each of the 8 `Modal` users plus Search. Each one fades out, none flashes
    an empty form, and AddASongModal's discard confirm still works.
  - **Docs:** `dev_readme-ui.md` → new "Modals" section covering the one shell, the exit animation,
    and why resets go in `onExitComplete`.

### Chat 4 — playlists, the new feature, backup

- [ ] **17. Link to the YouTube playlist** — `2026-10-18_at_13-58.jpg`
  `upd: link to the youtube playlist`
  - **Change:** `app/(site)/playlists/[slug]/page.tsx:64-66`, right after `<PlaylistVisibilityBadge>`:
    `{playlist.commerce?.youtube_url && <Link href={…} target="_blank" rel="noopener noreferrer">YouTube</Link>}`
    with `next/link`, styled as the same pill as the badge (`PlaylistVisibilityBadge.tsx:15`, neutral
    tone). It shows only where `youtube_url` is already sent: to the manager or a buyer (see
    "Confirmed by reading the code").
  - **Check:** as owner, the pill opens the YouTube playlist in a new tab. Signed out, there is no pill.

- [ ] **18. Change a playlist's cover** — `2026-10-18_at_17-22.jpg`
  `feat: change a playlist cover`
  - **Change:**
    - SQL (also add it to `dev_readme-supabase-sql.md:265` and to `app/interfaces/types_db.ts:83`
      Row / Insert / Update):
      ```sql
      ALTER TABLE public."19_playlists" ADD COLUMN IF NOT EXISTS cover_image_path TEXT NULL;
      ```
    - `actions/playlists.ts:213` and `:437`: use `playlist.cover_image_path ??` the first song's image.
    - New `app/api/playlists/[id]/cover/route.ts` `POST` (multipart `image`). Only the playlist's
      `user_id` or the admin may use it (same check as `app/api/playlists/[id]/order/route.ts`). Move
      `IMAGE_MIME_BY_EXTENSION` plus its check out of `app/api/songs/route.ts:13` into a shared lib and
      use it here (10 MB max). Upload to `images` at
      `getSafeStoragePath({ prefix: "cover", value: title, uniqueId, fileName, ownerEmail })`, update the
      row, then remove the previous custom cover. Errors follow rule 15.
    - New client component `PlaylistCoverPicker` used in `page.tsx:48` when `canManage`. It shows a
      `Change cover` hover overlay over the cover, a hidden file input, and a loading state, then
      `router.refresh()`.
  - **Known limit:** a custom cover is not in the files backup until plan-24 step 4
    (`plans/plan-24-backup-parity.md`) lands. Add a one-line note to that step that the column now
    exists.
  - **🚨 TODO in the commit body:** the `ALTER TABLE` above, as a chain (Supabase SQL editor → paste →
    run → the `cover_image_path` column shows on `19_playlists`).
  - **Docs:** new `dev_readme-playlists.md` covering how the cover is picked (custom, else the first
    song) and the cover route.

- [ ] **19. Users suggest song edits, the admin approves** — `2026-10-18_at_17-30.jpg`
  `feat: suggest song edits`
  - **Asked:** users may suggest other tags, title or author. The ADMIN reviews and approves or rejects.
  - **SQL** (also in `dev_readme-supabase-sql.md`):
    ```sql
    CREATE TABLE IF NOT EXISTS public."19_song_suggestions" (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      song_id BIGINT NOT NULL REFERENCES public."19_songs" (id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
      title TEXT NULL,
      author TEXT NULL,
      tags TEXT[] NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      reviewed_at TIMESTAMPTZ NULL
    );
    ALTER TABLE public."19_song_suggestions" ENABLE ROW LEVEL SECURITY;
    CREATE INDEX IF NOT EXISTS "19_song_suggestions_status_idx" ON public."19_song_suggestions" (status, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS "19_song_suggestions_one_pending_idx"
      ON public."19_song_suggestions" (song_id, user_id) WHERE status = 'pending';
    ```
    There are no RLS policies on purpose: only server routes (service role) select, insert or update
    rows here.
  - **Routes:**
    - `app/api/songs/[id]/suggestions/route.ts` `POST`. Signed-in users only, and only for a song they
      may play (`getSongAccess`, as in `app/api/songs/[id]/route.ts:18`). Title and author are at most
      200 characters, tags go through `parseSongTags`, and at least one field must differ from the
      song. Allow at most 20 pending suggestions per user. A second pending one for the same song
      replaces the first.
    - `app/api/suggestions/route.ts` `GET` (admin): pending suggestions, each with the song's current
      title, author and tags.
    - `app/api/suggestions/[id]/route.ts` `PATCH { action: "approve" | "reject" }` (admin). Approve
      updates `19_songs` with the non-null fields (tags replace the old tags), then sets `status` and
      `reviewed_at`.
  - **UI:**
    - Playlist rows (`PlaylistDetailContent.tsx:121`): when `!canEditSong` and the viewer is signed in,
      show a `Suggest edit` icon button in the same spot as the admin's edit button. It opens a new
      `SuggestSongEditModal` (uses `Modal` and `SongTagsInput`, prefilled with the current values).
    - New admin-only page `app/(site)/suggestions/page.tsx`. One card per suggestion shows the current
      value next to the suggested one, plus Approve and Reject. Add a sidebar item for the admin only,
      next to My Songs (`Sidebar.tsx` routes), showing the pending count.
  - **Decided:** approve takes the whole suggestion (no per-field picking). Only signed-in users
    suggest. The user is not notified of the result.
  - **🚨 TODO in the commit body:** the SQL above, as a chain.
  - **Docs:** new `dev_readme-song-suggestions.md` covering the table, the 3 routes, who can do what,
    and the limits.

- [ ] **20. Backup: show the exact error instead of "(500)"** — `2026-10-18_at_22-35.jpg` (the first
  chat named it 21-13)
  `fix: show the exact backup file error`
  - **Cause:** `app/api/backup/files/route.ts:36-41` calls `isOwnedFile` (which throws on a Supabase
    error, `backupConfig.ts:164`) inside a loop with no try/catch. Next.js then answers with an HTML
    500, so `BackupSDK.ts:248` gets HTML instead of JSON and shows the fallback text with only the
    status.
  - **Change:**
    - Route `GET`: wrap the whole handler. Return
      `{ error: "<name>: <message>", code, details, hint }` as JSON, and include the file path when the
      error happens in the loop. `:39` becomes `Signing a download URL for <bucket>/<path> failed:
      <error.message>`.
    - `BackupSDK.ts:247-250`: read the body as text. Try JSON. Build the message like `importTables`
      does (`:208-218`): status, statusText, error, code, details and hint. If it is not JSON, use the
      first 300 characters of the text. Same treatment for the other `.json().catch(() => ({}))` spot
      at `:68`.
  - **Likely root cause (not verified — no production logs here):** since `fe3454b` (2026-09-18) the
    GET makes 2 requests per file in a row (`isOwnedFile` + `createSignedUrl`). A big library on
    Cloudflare Workers can hit the subrequest limit. Once 20 ships, the exact message settles it.
  - **20b, only if that message confirms it:** separate commit `fix: batch backup download urls`. Make
    one ownership query per 100 paths with `.in()`, and one `createSignedUrls(paths, 3600)` per bucket.
  - **Check:** `pnpm test:backup` passes. Force an error (e.g. a wrong bucket name in a local run) and
    the red text names the real cause, not just `(500)`.
  - **Docs:** `app/features/backup/dev_readme-backup.md` → a "Failed iterations" entry if 20b ships.
    Otherwise one line on the error format.

---

## 5. Seen in `TODO/`, not in the list — left out on purpose

Not part of this plan. Each one is noted here so it is not lost:

- `TODO/2026-10-18_at_17-53.jpg`: "add tags in Russian as well for better search, and images on 30".
- `no error no loading - nothing.jpg` (repo root, untracked): the sidebar library suddenly showed no
  songs, with no error and no loading state.
- `TODO/Screenshot_20261018-181716.png`: toast `Unexpected token '<', "<!DOCTYPE "... is not valid
  JSON`. Same shape as task 20: `hooks/useOnPlay.ts:29` calls `response.json()` on an HTML error page.
- `TODO/Screenshot_20261018-175708.png` and `-181550.png`: on a phone, a long artist name runs under
  the play button in the player bar.
- `TODO/for me/` — his own folder, not read.
