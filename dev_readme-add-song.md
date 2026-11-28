# Add a song

## Layout

`components/AddASongModal.tsx` is a two-column grid on desktop: song fields on the left, playlist on the right. The left column stays in normal flow. The dialog width stays inside the window. On a short window the dialog scrolls, and Create stays pinned to the bottom of that scroll. The human check is mounted only when it will actually render. Its box does not scroll.

## Progress in the Create button

Upload progress is drawn inside the Create button. The button is `relative overflow-hidden`. A fill behind the label uses `absolute inset-y-0 left-0 bg-black/15` and its width is the percent. The button stays the same height before, during, and after the upload, so the modal does not jump.

While the file is read the label is `Reading audio… 0%`. While it is encoded the label is `Converting 52.0 MB -> 45.5 MB… 45%`, and that number stays at 99 or below. The percent starts again at 0 for the send. While the bytes are sending it is `Uploading… 45% · 4.9 MB/s · about 12s left`, and the fill stops at 90 when the last byte has been sent. The label then reads `Inserting song in DB… 94% · about 8s left`. When that estimate passes, it reads `Inserting song in DB… 99% · still working`. The fill stays under 100 for the whole open request. The button returns to Create when the song row exists.

While `Inserting song in DB…` shows, the modal asks `GET /api/songs/upload-status` every 5 seconds (`STORED_CHECK_MS`). It returns the song id once the row and its `19_song_access` row exist - the last row the POST inserts. That id ends the wait even when the POST answer never arrives. Before this, a lost answer kept the button disabled at 100% until the wait limit, and `Send it again` stored the same song a 2nd time.

`Song created.` stays in the modal header until the next edit. A failure stays in that same header. Neither result uses a toast.

## Duplicate uploads

A duplicate (same account, title, author, and prepared audio byte size) opens `components/DuplicateSongModal.tsx` with three choices:

- **Upload with new name:** edit the suggested `<title> (copy)` and upload a separate song. Empty or unchanged titles stay in the dialog with an explanation.
- **Replace existing song:** upload the selected audio, cover, and details into the existing song row. Its ID, likes, and playlist positions stay intact. The selected playlist's paid setting is applied; other playlists keep their access settings. If needed, the song is also added to the selected playlist.
- **Don’t upload:** close the choice dialog without another request. The original upload form stays filled in. Escape and the dialog's close button do the same.

`POST /api/songs` returns a structured `song_exists` conflict with the existing song ID. A replacement explicitly sends `replaceSongId`; the server verifies ownership, stores new files, then updates the existing row. Update failures restore playlist/access changes and remove the new files. Old audio and cover files are removed only after the row update succeeds. A replacement lock and a comparison against the original audio path prevent a stale upload from overwriting a newer replacement.

The modal caches prepared audio for the current file so either upload choice avoids converting it again. Each request sends a fresh `uploadId`; the server uses it in the stored file names. Upload-status checks match that ID against the stored audio path, so an older copy cannot count as this upload completing, including when a replacement preserves `created_at`.

After replacement, the player's cached signed URL for that song is invalidated so playback opens the newly stored audio.

Regression checks: `node --experimental-strip-types --test tests/songUploadConflict.test.mjs tests/songCreateGuard.test.mjs tests/uploadProgress.test.mjs libs/songUpload.test.mjs`.

## Accepted audio and conversion

The song picker uses `accept="audio/*"`. That hint is not a check. The change handler refuses a file when its type does not start with `audio/` and its extension is not one of mp3, m4a, wav, flac, ogg, oga, opus, aac, webm, aif, or aiff. The input is cleared and the message names the file.

`libs/songUpload.ts` accepts that same list. MP3 and M4A files up to 50 MiB keep their original audio bytes and format. Other formats and oversized files are converted to MP3; the bitrate aims for at most 49 MiB (down to 8 kbps), using the source bitrate when it is known. See `dev_readme-compress.md`. When the browser fails to decode a file, the error names the file and the browser error (`Error: …`). The upload route accepts `.mp3` with `audio/mpeg` and `.m4a` with `audio/mp4`.

## After an upload

A successful upload leaves the modal open. Title, author, song file, cover, paid box, tags, and the tag draft are cleared. The selected playlist stays. The title field is focused. The human check is rolled again. Top tags are read again because the new song can change them. Closing right after that upload does not ask to discard changes while the playlist is still the one just used.

## Tag autofill

The modal ranks tags across all songs in the selected playlist, suggests up to eight English-style labels, and auto-fills at most two that occur on at least two songs. Removed tags are suppressed for that user and playlist. See [dev_readme-tags.md](dev_readme-tags.md) for the language filter and storage details.

## Tags box scroll

`components/SongTagsInput.tsx` caps the tag field at `max-h-[4.5rem]` and scrolls inside that field (`overflow-y-auto overscroll-contain`). Extra tags stay in the field. They do not make the dialog taller.
