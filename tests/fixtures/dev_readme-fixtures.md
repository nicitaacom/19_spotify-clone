`song-upload.m4a` is a one-second synthesized 440 Hz tone, not a music recording.
Generate it with:

```sh
ffmpeg -v error -f lavfi -i 'sine=frequency=440:duration=1' -c:a aac -b:a 192k -ar 44100 -ac 2 -y tests/fixtures/song-upload.m4a
```

Run the audio upload regression tests with:

```sh
node --experimental-strip-types --test libs/songUpload.test.mjs libs/mp3Tags.test.mjs
```

The Node tests stub Web Audio decoding and exercise the real MP3 encoder. The fixture can also be used to check native M4A decoding in a browser.
