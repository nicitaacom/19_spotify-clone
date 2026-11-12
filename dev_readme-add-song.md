# Add a song

## Layout

`components/AddASongModal.tsx` is a two-column grid on desktop: song fields on the left, playlist on the right. The left column stays in normal flow. The dialog width stays inside the window. On a short window the dialog scrolls, and Create stays pinned to the bottom of that scroll. The human check is mounted only when it will actually render. Its box does not scroll.

## Progress in the Create button

Upload progress is drawn inside the Create button. The button is `relative overflow-hidden`. A fill behind the label uses `absolute inset-y-0 left-0 bg-black/15` and its width is the percent. The button stays the same height before, during, and after the upload, so the modal does not jump.

While the file is read the label is `Reading audio… 0%`. While it is encoded the label is `Converting 52.0 MB -> 45.5 MB… 45%`, and that number stays at 99 or below. The percent starts again at 0 for the send. While the bytes are sending it is `Uploading… 45% · 4.9 MB/s · about 12s left`, and the fill stops at 90 when the last byte has been sent. The label then reads `Storing the song… 94% · about 8s left`. When that estimate passes, it reads `Storing the song… 99% · still working`. The fill stays under 100 for the whole open request. The button returns to Create when the song row exists.

While `Storing the song…` shows, the modal asks `GET /api/songs/upload-status` every 5 seconds (`STORED_CHECK_MS`). It returns the song id once the row and its `19_song_access` row exist - the last row the POST inserts. That id ends the wait even when the POST answer never arrives. Before this, a lost answer kept the button disabled at 100% until the wait limit, and `Send it again` stored the same song a 2nd time.

`Song created.` stays in the modal header until the next edit. A failure stays in that same header. Neither result uses a toast.

## Accepted audio and conversion

The song picker uses `accept="audio/*"`. That hint is not a check. The change handler refuses a file when its type does not start with `audio/` and its extension is not one of mp3, m4a, wav, flac, ogg, oga, opus, aac, webm, aif, or aiff. The input is cleared and the message names the file.

`libs/songUpload.ts` accepts that same list. A short file is stored at 128 kbps. A file over 50 MiB is stored at the highest bitrate whose estimated size is at or under 49 MiB (down to 8 kbps), using the source bitrate when it is known. See `dev_readme-compress.md`. The stored name always ends in `.mp3`. When the browser fails to decode the file, the error names the file and the browser error (`Error: …`). The upload route accepts only `.mp3` with `audio/mpeg`, because the browser converts before sending.

## After an upload

A successful upload leaves the modal open. Title, author, song file, cover, paid box, tags, and the tag draft are cleared. The selected playlist stays. The title field is focused. The human check is rolled again. Top tags are read again because the new song can change them. Closing right after that upload does not ask to discard changes while the playlist is still the one just used.

## Tag autofill

`recentPlaylistTags` looks at the last 8 songs on the selected playlist. `top` is the first 2 tags by how often they appear. `autofill` is the tags in `top` that appear on 2 or more of those songs. A tag used once is not filled in. When nothing qualifies, the playlist name's genre tags are the fallback. The badge row uses `top`, so it shows at most 2 tags from the playlist. The note reads `Filled from your most used tags on <playlist>.` and the button is `Use top tags`.

## Tags box scroll

`components/SongTagsInput.tsx` caps the tag field at `max-h-[4.5rem]` and scrolls inside that field (`overflow-y-auto overscroll-contain`). Extra tags stay in the field. They do not make the dialog taller.
