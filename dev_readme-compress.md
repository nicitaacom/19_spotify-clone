# Song upload compression

How `libs/songUpload.ts` chooses the MP3 bitrate before Create sends the file. The separate `/compress-file` screen is not this path.

## Storage cap

The upload route accepts one `audio/mpeg` file up to 50 MiB (`MAX_SONG_UPLOAD_BYTES`, 50 × 1024 × 1024). When a file is over that, the encoder aims at 49 MiB (`UPLOAD_FIT_BYTES`) so the result stays under the cap.

## When Create re-encodes

`components/AddASongModal.tsx` calls `prepareSongUpload` before the POST. The Create button reads `Reading audio… N%` until the bitrate step is picked, then `Converting 52.0 MB -> 45.5 MB… N%` while the encoder runs (the source size, then the estimate for the picked step). When the file is sent unchanged, no `Converting` label shows. The upload percent starts again at 0 after that.

The file is sent unchanged when it is already an MP3, at or under 128 kbps, and at or under 50 MiB.

It is re-encoded when any of these is true:

- the extension is not mp3 (m4a, wav, flac, ogg, oga, opus, aac, webm, aif, aiff)
- the file is over 50 MiB
- the source bitrate is over the chosen step (a 320 kbps MP3 under the cap becomes 128 kbps)

A second Create during that work does not insert another song. `songCreateBusy` stays set for the whole prepare-and-send, including a second modal instance, and the form is cleared before the button enables again. Held Ctrl+Enter does not submit on each key repeat. The upload route rejects another create with the same user, title, author, and byte size, however long ago the first one was stored - before it stores the files, and once more right before it inserts the row, so a re-sent POST or a stale upload lock removes its own files instead of adding a 2nd song. The resulting choice dialog offers **Upload with new name**, **Replace existing song**, and **Don’t upload**. The prepared audio is reused when choosing a new name or replacement; see `dev_readme-add-song.md`.

## Bitrate step

The ladder, highest first: 128, 112, 96, 80, 64, 56, 48, 40, 32, 24, 16, 8 kbps.

For an MP3, `music-metadata` supplies `format.bitrate`. A missing or zero number falls back to file bytes × 8 / duration.

When the file is already at or under 50 MiB, the step is 128 kbps. A file at or under 128 kbps is kept. A higher bitrate is encoded at 128.

When the file is over 50 MiB, the ladder starts higher: 320, 256, 224, 192, 160, then the steps above. A step over the source bitrate is skipped. The estimate for a step is `file bytes × (step × 1000) / source bitrate`. The highest step whose estimate is at or under 49 MiB is the one used - only as much compression as the cap needs.

- 52 MiB at 320 kbps becomes 256 kbps, about 41.6 MiB
- 52 MiB at 256 kbps becomes 224 kbps, about 45.5 MiB (not 128 kbps, 26 MiB)
- 52 MiB at 128 kbps becomes 112 kbps, about 45.5 MiB
- 52 MiB at 64 kbps becomes 56 kbps, about 45.5 MiB
- 40 MiB at 128 kbps stays 128 kbps

A 52 MiB file is not taken from 128 kbps to 64, or from 64 kbps to 32. That cut came from using duration alone. A duration that is too long makes every step look too big, so several steps are skipped and the file lands near half its size. Size and source bitrate keep the nearest step that fits.

When the bitrate is unknown (a wav, or an MP3 with no bitrate), the step comes from duration: `seconds × kbps × 1000 / 8` must be at or under 49 MiB. One minute stays 128. One hour is 112. 8112 seconds is 48. Three hours is 32.

## How the bytes are built

If PCM at 44.1 kHz, stereo, 32-bit would go past 256 MB, an MP3 goes through `compress-file/lib/transcodeMp3.ts` (MPEG frames, no full decode). Shorter files are decoded, then `slow-and-reverb/lib/encodeMp3.ts` builds the MP3. The stored name ends in `.mp3` and the type is `audio/mpeg`.

If the result is still over 50 MiB, Create stops. The error names the file, the bitrate, and both byte counts.

## Silent audio after compression

The 60-minute server-room recording is 48 kHz stereo. Fitting it under the cap selects 112 kbps, at which lamejs chooses 44.1 kHz. Its internal resampler can consume fractional input counts and corrupt its PCM state, producing an MP3 with valid frames and duration but entirely silent audio. Format-only tests did not catch this.

Both `transcodeMp3.ts` and `encodeMp3.ts` now use `libs/mp3Encoder.ts`. It selects the encoder's output sample rate before encoding, resamples PCM with a windowed-sinc filter, and passes matching-rate PCM to lamejs. The streaming filter retains its position and history between chunks, so long recordings need no full PCM buffer. It also filters frequencies above the new Nyquist limit instead of aliasing them into the output.

`libs/mp3Encoder.test.mjs` checks audible sample levels, stereo balance, duration, chunk boundaries, anti-aliasing, and matching encoder/frame rates across the upload bitrate ladder. `libs/songUpload.test.mjs` exercises an oversized 48 kHz MP3 through the actual streaming upload preparation and decodes the result to verify audible audio.

Existing silent uploads must be replaced using the source file; the missing audio cannot be recovered from the silent MP3. Successful replacement invalidates the player's cached audio URL and reloads the currently selected song's address.

Verified with the original 54,909,693-byte server-room recording: the prepared file is 50,420,663 bytes (48.1 MiB), 112 kbps, and 44.1 kHz stereo. FFmpeg decodes the entire result; Chromium reports 60:01.48 and measurable audio at 5, 1800, and 3580 seconds. A browser conversion of a source excerpt also retains audible audio. These are local conversion/playback checks, not a live storage replacement.

Run the signal and upload regressions with `node --experimental-strip-types --test libs/mp3Encoder.test.mjs libs/songUpload.test.mjs libs/mp3Tags.test.mjs`.
