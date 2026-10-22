# Add a song

## Layout

`components/AddASongModal.tsx` is a two-column grid on desktop: song fields on the left, playlist on the right. The left column stays in normal flow. It is not an absolute scroll area. Desktop height follows the playlist column, so the song fields do not add a second scrollbar.

## Progress in the Create button

Upload progress is drawn inside the Create button. The button is `relative overflow-hidden`. A fill behind the label uses `absolute inset-y-0 left-0 bg-black/15` and its width is the percent. The label reads `Uploading… 45% · 4.9 MB/s`, or `Preparing audio… 45%` while the file is being encoded. The button stays the same height before, during, and after the upload, so the modal does not jump.

## Tags box scroll

`components/SongTagsInput.tsx` caps the tag field at `max-h-[4.5rem]` and scrolls inside that field (`overflow-y-auto overscroll-contain`). Extra tags stay in the field. They do not make the dialog taller.
