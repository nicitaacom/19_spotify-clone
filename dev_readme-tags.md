# Song tags

Song tags are stored in `19_songs.tags`. The add and edit forms accept labels as badges; Enter or a comma commits the draft, and the remaining draft is included when the form is submitted. Up to 32 normalized labels can be saved. The existing translation service can add bilingual labels to the saved song; translation is separate from playlist autofill.

## Playlist suggestions and autofill

In the add-song modal, `usePlaylistRecentTags` reads every membership for the selected playlist in pages and then reads those songs' tags. `popularPlaylistTags` counts each label once per song and orders labels by frequency, breaking ties by the newest occurrence and then its order on that song. The playlist name and global tag list are not used as fallback suggestions for a selected playlist.

Playlist suggestions include up to eight English-style labels. The form automatically fills at most two of those labels, and only when each occurs on at least two songs. Labels using non-ASCII letters, including Cyrillic translations, are excluded before choosing either list, so they cannot occupy one of the two autofill positions. Stored tags do not have language or translation metadata: this script filter cannot distinguish English from other languages written with ASCII letters, and it excludes English words with accented characters. Manual entry and saved song tags are not restricted by this suggestion filter.

When a tag is removed in the add-song modal, the browser stores its suppression under a key scoped to the signed-in user and playlist. It stays out of that playlist's suggestions and autofill after an upload or reopening the modal. Entering the tag explicitly clears its suppression. If browser storage is unavailable, suppression lasts only for the current modal state.

## Playlist genre triggers

The upload API preserves the submitted tags after creating the playlist link, including when an older database has the automatic genre trigger. Replacement also writes the submitted tags after linking. To stop old database triggers from adding playlist-title genres in other flows, run [stop-playlist-genre-tagging.sql](supabase/stop-playlist-genre-tagging.sql) in the database SQL Editor. It leaves existing tags unchanged; old automatic tags cannot be reliably distinguished from labels chosen by a user.

## Checks

Run `node --experimental-strip-types --test libs/songTags.test.mjs libs/playlistTagDismissals.test.mjs` for ranking and suppression, and `pnpm test:playlist-tags` for the modal's upload, replacement, and reopen flow with simulated database and upload responses.
