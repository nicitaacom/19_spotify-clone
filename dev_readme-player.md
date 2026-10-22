# Player — Architecture & Known Bug Fixes

## Stack

- **`useSound`** (Howler.js wrapper) — audio playback
- **`usePlayer`** (Zustand store) — global player state: activeId, isPlaying, progress, playbackCommand, savedPosition, etc.
- **`Player.tsx`** — renders the fixed bottom bar, progress bar, handles keyboard shortcuts, mounts `<PlayerContent key={song.id-songUrl} />`
- **`PlayerContent.tsx`** — owns the `useSound` instance, all Howler callbacks, play/pause/seek logic
- **`usePreloadNextTrack.ts`** — polls `sound.seek()` on an interval to drive the progress bar, preloads the next track at 80% through

---

## Key design decisions

### `key` prop on `<PlayerContent>`

```tsx
<PlayerContent key={`${song.id}-${songUrl}`} song={song} songUrl={songUrl} />
```

Forces a full React remount (and Howler `sound.unload()`) when the song changes. This is intentional — it's the cleanest way to reset all Howler state without managing complex teardown logic manually.

### `html5: true` on `useSound`

```ts
const [play, { pause, sound }] = useSound(songUrl, { html5: true, ... })
```

Required for large MP3s (>~10MB). Without it the browser tries to decode the entire file into Web Audio API memory and fails with "Decoding audio data failed". With `html5: true` the browser streams via a `<audio>` element instead.

**Side effect:** Howler fires `onpause` multiple times in rapid succession when using `html5: true`. See bug fix below.

### Track start and `savedPosition`

`startPlayback` updates the queue, active song, loading state, saved position, and `play` command in one Zustand update. `PlayerContent` waits for its Howl to load, then consumes that command. Cleanup saves the current position when the same song is being reloaded; the next `play` command restores it after the audio starts.

---

## Bug fixes

### Bug: Song restarts from 0 on Space / pause-resume (infinite ONPAUSE loop)

**Symptom:** Pressing Space to pause caused the song to restart from the beginning on the next play. Progress bar showed stale position.

**Root cause:** With `html5: true`, Howler can emit several pause events close together. Treating every event as a new state change could re-run the same pause command.

**Fix:** The `onpause` handler exits when the player is already paused. The command effect also records each `playbackCommandId` once. It keeps `sound` as a dependency so a newly loaded Howl can receive a pending play command.

```ts
// In useSound onpause callback — guard against duplicate fires
onpause: () => {
  if (!isPlayingRef.current) return  // ← breaks the loop
  setIsPlaying(false)
  isPlayingRef.current = false
  setIsPlayingInStore(false)
},
```

**Rule going forward:** Any Howler callback (`onpause`, `onplay`, `onend`) must guard against being called when already in the target state. Use `isPlayingRef.current` (a ref, not state) as the guard — refs don't trigger re-renders.

---

### Bug: Duplicate playback and next track failing to start

**Symptoms:** A new track appeared in the player but did not start, or playback started twice.

**Causes:** `useSound` captures Howler callbacks when it constructs a Howl, and HTML5 Howler can create another audio node if `.play()` is called while a node is already playing. Track selection also used several separate store updates, so the active song and play intent could be observed at different times.

**Fix:**

- `usePlayer.startPlayback` atomically sets the queue, active song, loading state, and a new `play` command. Initial selection, next, previous, and repeat-all use this action.
- `PlayerContent` waits for its sound instance, then handles each command ID once. It no longer has a separate mount-autoplay path.
- Every start goes through `playSound`, which skips calls while Howler is already playing or a request is pending. Natural end reads current repeat and queue state through a ref.
- Cleanup saves the position only when the same track is being reloaded. A new sound instance replays the command and restores that position after playback starts.

**Rule going forward:** keep track selection and play intent together in `startPlayback`, and never call HTML5 Howler `.play()` without the `playing()` and pending-request guards.

---

### Bug: Progress bar frozen / showing stale time after tab switch

**Symptom:** After switching tabs, the progress bar stayed frozen at the position from before the tab switch.

**Root cause:** The progress polling interval in `usePreloadNextTrack` only runs when `isPlaying === true`. On tab switch, `isPlaying` local state resets to `false` (component re-renders), so the interval stopped and never restarted.

**Fix:** The polling effect also watches `isPlayingInStore` (from Zustand) as a fallback — the store value stays `true` across re-renders triggered by tab switch, so the interval restarts correctly.

---

### Bug: headphone pause leaves the pause icon

**Symptom:** Pausing from headphones or Chrome's toolbar media controls left the pause icon showing. The next click on Play did nothing, and a second click was needed to resume.

**Root cause:** No `mediaSession` `play` or `pause` handler was registered. The browser paused Howler's `<audio>` element directly. Howler's `onpause` did not run, so `isPlaying` stayed `true` and `sound.playing()` stayed `true`. `playSound` then returned early.

**Fix:**

- `play` and `pause` media actions call `requestPlaybackCommand`, the same path as the Play button.
- `mediaSession.playbackState` is set to `"playing"` in `onplay` and `"paused"` in `onpause`.
- A native `pause` listener covers pauses that send no media action, such as a Bluetooth disconnect or Android audio focus. If the element is paused while Howler still reports playing, and stall recovery is not running, the listener calls Howler's `pause` so `onpause` updates the icon.

**Rule going forward:** Headphone and browser media buttons go through `requestPlaybackCommand`. A pause of the `<audio>` element also pauses the Howl, except while stall recovery is pausing on purpose.

---

## Progress bar

The progress bar is driven by a `setInterval` in `usePreloadNextTrack` polling the active sound ID through `seekCurrentSound() / sound.duration()` every 400ms. It is **not** event-driven. Only this interval updates ongoing progress; a second interval used to overwrite the position after a seek. This means:

- Progress resets to 0 on song change (`currentSong.id` dep in the reset effect)
- If the interval stops (e.g. `isPlaying` goes false), progress freezes at the last polled value — this is intentional while paused
- `setProgress(0)` is also called in `PlayerContent` when `sound` becomes null during re-init

### Seeking on self-hosted storage

The self-hosted Supabase signed download returned HTTP `200` with the whole MP3 even when asked
for `Range: bytes=100000-101023`. A streaming HTML5 audio element needs a `206` byte-range
response to seek to an unbuffered point; without it, clicking the progress bar could restart the
song.

`/api/songs/[id]/play` now returns a same-origin stream URL. That URL checks song access on each
request and responds to single byte ranges with `206`, `Content-Range`, and `Accept-Ranges`. It asks
storage for the range first. If storage ignores it, the route discards preceding bytes as a stream
and sends only the requested bytes to the player. This avoids buffering the full song in the
server's memory, though a deep seek still makes storage transmit all bytes up to that point.

### Network stalls

Howler does not expose the native HTML media `waiting` or `stalled` events. `PlayerContent`
therefore attaches listeners to the HTML5 audio node owned by the Howl:

- `waiting`, `stalled`, and media `error` switch the control to a buffering spinner
- `playing` clears buffering as soon as media is flowing again
- a five-second watchdog reloads the stream and retries from the exact current position without
  creating a second audio node
- an `online` event retries immediately after connectivity returns
- after three failed retries playback is paused and the user gets an error instead of an
  indefinitely stuck pause button/progress bar

The buffering spinner remains clickable so the user can cancel recovery and pause.

## Exclusive playback across tabs

The Account page has an opt-in **Stop music playing in other tabs** switch. Its value is stored by
Zustand persist under `exclusive-playback-preference`, keyed by Supabase user ID. localStorage has
no expiry; a `storage` listener rehydrates the store when another open tab changes the preference.

When enabled, `PlaybackSyncProvider` connects to Pusher Channels cluster `eu` and subscribes to the
authenticated user's `private-playback-{userId}` channel. Starting playback publishes a
`playback-started` event through the authenticated `/api/pusher/playback` server route. Other tabs
pause all registered playback engines. A same-browser `BroadcastChannel` sends the same event
immediately so a newly opened tab cannot miss a Pusher event while its WebSocket is still
subscribing.

- the fixed site player
- Slow & Reverb
- 8D Generator

The Pusher subscription authorization route only signs the private channel matching the current
Supabase user. `PUSHER_APP_ID` and `PUSHER_SECRET` remain server-only;
`NEXT_PUBLIC_PUSHER_APP_KEY` is the only credential included in the browser bundle.

Required environment variables:

```dotenv
PUSHER_APP_ID=''
NEXT_PUBLIC_PUSHER_APP_KEY=''
PUSHER_SECRET=''
```

## Keyboard shortcuts (Player.tsx)

| Key | Action |
|-----|--------|
| `Space` | Toggle play/pause |
| `Escape` | Seek to 0 (restart) |
| `F8` | Stop (pause + seek to 0) |

Shortcuts are ignored when focus is on an `INPUT`, `TEXTAREA`, or `contentEditable` element.
