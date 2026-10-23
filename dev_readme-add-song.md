# Add a song

## Layout

`components/AddASongModal.tsx` is a two-column grid on desktop: song fields on the left, playlist on the right. The left column stays in normal flow. The dialog width stays inside the window. On a short window the dialog scrolls, and Create stays pinned to the bottom of that scroll. The human check is mounted only when it will actually render. Its box does not scroll.

## Progress in the Create button

Upload progress is drawn inside the Create button. The button is `relative overflow-hidden`. A fill behind the label uses `absolute inset-y-0 left-0 bg-black/15` and its width is the percent. The label reads `Uploading… 45% · 4.9 MB/s`, or `Preparing audio… 45%` while the file is being encoded. The button stays the same height before, during, and after the upload, so the modal does not jump.

## Accepted audio and conversion

The song picker uses `accept="audio/*"`. That hint is not a check. The change handler refuses a file when its type does not start with `audio/` and its extension is not one of mp3, m4a, wav, flac, ogg, oga, opus, aac, webm, aif, or aiff. The input is cleared and the message names the file.

`libs/songUpload.ts` accepts that same list. A short file is stored at 128 kbps. A longer file is stored at the highest bitrate that fits in 50 MB (down to 8 kbps). The stored name always ends in `.mp3`. When the browser fails to decode the file, the error names the file and the browser error (`Error: …`). The upload route accepts only `.mp3` with `audio/mpeg`, because the browser converts before sending.

## After an upload

A successful upload leaves the modal open. Title, author, song file, cover, paid box, tags, and the tag draft are cleared. The selected playlist stays. The title field is focused. The human check is rolled again. Top tags are read again because the new song can change them. Closing right after that upload does not ask to discard changes while the playlist is still the one just used.

## Tag autofill

`recentPlaylistTags` looks at the last 8 songs on the selected playlist. `top` is the first 2 tags by how often they appear. `autofill` is the tags in `top` that appear on 2 or more of those songs. A tag used once is not filled in. When nothing qualifies, the playlist name's genre tags are the fallback. The badge row uses `top`, so it shows at most 2 tags from the playlist. The note reads `Filled from your most used tags on <playlist>.` and the button is `Use top tags`.

## Tags box scroll

`components/SongTagsInput.tsx` caps the tag field at `max-h-[4.5rem]` and scrolls inside that field (`overflow-y-auto overscroll-contain`). Extra tags stay in the field. They do not make the dialog taller.
