`song-upload.m4a` is a one-second synthesized 440 Hz tone, not a music recording.
Generate it with:

```sh
ffmpeg -v error -f lavfi -i 'sine=frequency=440:duration=1' -c:a aac -b:a 192k -ar 44100 -ac 2 -y tests/fixtures/song-upload.m4a
```

Run the audio upload regression tests with:

```sh
node --experimental-strip-types --test libs/mp3Encoder.test.mjs libs/songUpload.test.mjs libs/mp3Tags.test.mjs
```

The M4A Node tests stub Web Audio decoding and exercise the real MP3 encoder. The long-MP3 upload regression uses the real streaming decoder and verifies audible output. Encoder tests decode the result to check sample levels, stereo balance, timing, and resampling across chunks.

Run the incremental M4A upload regression in a local Chrome installation with:

```sh
node --experimental-strip-types --test tests/songUploadBrowser.test.mjs
```

Set `CHROME_BIN` if Chrome is installed elsewhere. The test requires a recent Node.js with a built-in WebSocket. It uses the fixture with a long duration to force the streaming path, rejects whole-file reads and decoding, submits the generated MP3 as multipart form data to a local server, and checks its bitrate, duration, and sound. Long AAC M4A conversion requires WebCodecs AAC support in the browser; long files in other non-MP3 formats must first be exported as MP3 or M4A.
