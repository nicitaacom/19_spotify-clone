# Playlist MP3 downloads

Each song on `/playlists/[slug]` has a download button after the add-to-playlist button, including on mobile. The button shows a spinner while preparing the MP3 and disables downloads for locked or unavailable songs.

`components/DownloadSongButton.tsx` renders the button. `hooks/useSongDownload.ts` owns progress, duplicate-click protection, and error notifications. `libs/songDownload.ts` fetches the audio, prepares its metadata, and starts the browser download. Download code and M4A encoding are imported on demand.

Audio comes from `/api/songs/[id]/play?stream=download`. That route checks current song access on every request. Free songs, purchased songs, and songs available to the site owner follow the existing playback rules. A stale page still receives an error if the server denies access.

The downloaded file is named `Artist - Title.mp3`, with filesystem separators replaced and control characters removed. Its ID3v2.3 metadata contains:

- Current song title and author from the playlist data.
- Current uploaded cover image, falling back to the source file's embedded cover if the image request fails. JPEG and PNG are embedded directly; other image formats are converted to JPEG for music player support.
- Source album, or the playlist title when the source has no album.
- Source album artist, year, genre, and track number/total when present.

Existing MP3 audio is copied without re-encoding. `libs/mp3Tags.ts` removes previous leading ID3v2 tags and trailing ID3v1 tags before adding the current metadata. Other source metadata fields are not copied. M4A files are decoded with a separate `OfflineAudioContext` and encoded at 320 kbps using the existing MP3 encoder. Downloading leaves the main player's playback untouched. The browser must support decoding the uploaded M4A codec.

No database migration, storage write, new dependency, or server-side encoder is required. The browser prepares one whole audio file in memory, so M4A conversion uses more memory and takes longer than an MP3 download.

Checks: `pnpm type-check`, ESLint on the changed files, and `node --experimental-strip-types --test libs/mp3Tags.test.mjs`. The metadata tests use real MP3 frames and the independent `music-metadata` parser to verify readable tags and cover bytes, unchanged audio, old-tag removal, malformed headers, and safe filenames.

Metadata format reference: [ID3v2.3 specification](https://id3.org/id3v2.3.0). Browser decoding reference: [decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData).
