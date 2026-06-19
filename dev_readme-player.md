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

### `savedPosition` in Zustand store

When `PlayerContent` unmounts (song change via `key` prop), the cleanup saves the current seek position to `savedPosition` in the store. On mount of the new `PlayerContent`, if `savedPosition > 0` it seeks there after the first `play` event. This handles tab-switch resume.

---

## Bug fixes

### Bug: Song restarts from 0 on Space / pause-resume (infinite ONPAUSE loop)

**Symptom:** Pressing Space to pause caused the song to restart from the beginning on the next play. Progress bar showed stale position.

**Root cause (confirmed via logs):** `html5: true` causes Howler to fire `onpause` multiple times in rapid succession. Each `onpause` call triggered:

1. `setIsPlayingInStore(false)` → Zustand store update
2. Store update → React re-render
3. Re-render → `CMD-EFFECT` (playbackCommand effect) re-ran (it had `sound` in its dep array)
4. `CMD-EFFECT` called `pause()` again
5. → `onpause` fired again → infinite loop

**Fix:**

```ts
// In useSound onpause callback — guard against duplicate fires
onpause: () => {
  if (!isPlayingRef.current) return  // ← breaks the loop
  setIsPlaying(false)
  isPlayingRef.current = false
  setIsPlayingInStore(false)
},
```

Also removed `sound` from the `playbackCommand` effect's dependency array — it doesn't need `sound` directly (it calls `play()`/`pause()` which are stable refs from `useSound`), and having it there caused the effect to re-run on every re-render, compounding the loop.

```ts
// Before (wrong):
}, [activeId, isLoading, pause, play, playbackCommand, playbackCommandId, song.id, sound])

// After (correct):
}, [activeId, isLoading, pause, play, playbackCommand, playbackCommandId, song.id])
```

**Rule going forward:** Any Howler callback (`onpause`, `onplay`, `onend`) must guard against being called when already in the target state. Use `isPlayingRef.current` (a ref, not state) as the guard — refs don't trigger re-renders.

---

### Bug: Double play on tab switch

**Symptom:** Switching tabs while a song plays caused it to play twice simultaneously.

**Root cause:** `sound.play()` was called in a `useEffect([sound])` with no guard. Tab switching causes Howler to reinitialize `sound`, which changed the reference and re-triggered the effect, calling `play()` on the new instance while the old one was still audible.

**Fix:** `didAutoPlayRef` tracks whether we've already initiated playback for this mount. The `wasPlayingRef` tracks whether we were playing before the sound re-init, so on tab-back we only resume if we were actually playing (not if paused):

```ts
const didAutoPlayRef = useRef(false)
const wasPlayingRef = useRef(false)

useEffect(() => {
  if (!sound) return
  if (didAutoPlayRef.current) {
    if (wasPlayingRef.current) {
      sound.play()  // resume only if was playing
    }
    return
  }
  didAutoPlayRef.current = true
  sound.play()
  return () => {
    wasPlayingRef.current = isPlayingRef.current
    sound.unload()
  }
}, [sound])
```

---

### Bug: Double play (two streams at once) AND song restarts instead of resuming — the real root cause

**Symptoms:**
1. The same song is audible twice at the same time.
2. Pressing play after pause restarts the track from 0 instead of continuing.

**Root cause (two parts, both confirmed against `use-sound@4.0.4` source):**

**Part A — frozen Howler callbacks.** `use-sound` spreads the `on*` callbacks into `new Howl(...)` **once, at construction**, and never updates them (only `onload` is wired by use-sound itself; everything else rides along in `delegated`). So `onend` / `onpause` capture the **first render's** closures — `repeatMode` is stuck at its initial `"off"`, `onPlayNext` is stuck at the initial `ids`/`activeId`. The stale `onend` then drives playback with wrong state (wrong next track, or the repeat-one `seek(0); play()` path firing when it shouldn't → restart).

**Part B — `play()` stacks a second node.** With `html5: true`, Howler's `.play()` does **not** no-op when a sound node is already active; it spawns a **second** `<audio>` element. Multiple call sites (autoplay effect, play-command effect, play button, replay) could each call `.play()` while a node was still alive → two simultaneous streams.

**Fix:**

1. Route the dynamic callbacks through a ref refreshed every render, so Howler always runs current logic:

```ts
const handleEndRef = useRef<() => void>(() => {})
useEffect(() => {
  handleEndRef.current = () => {
    /* reads CURRENT repeatMode + onPlayNext */
  }
}, [repeatMode, onPlayNext, setIsPlayingInStore])

// in useSound options — stable identity, always calls latest:
onend: () => handleEndRef.current(),
```

2. Funnel every start/resume through one guarded helper that refuses to stack a node and never seeks on resume (html5 Howl keeps its position across `pause()`, so a plain `play()` continues):

```ts
const playSound = useCallback(() => {
  const s = soundRef.current
  if (!s) { play(); return }
  if (s.playing()) return   // ← prevents the 2nd node (double play)
  s.play()                  // ← resumes from retained position (no restart)
}, [play])
```

All play call sites (command effect, `handlePlay`, the autoplay resume branch) now go through `playSound` / a `playing()` check. Only explicit **replay** and **repeat-one** call `seek(0)` before playing.

**Rule going forward:** never call `sound.play()` unguarded with `html5: true` — always check `sound.playing()` first, or you get a duplicate stream. And never assume a `useSound` `on*` callback sees current state — it sees the values from the render that created the Howl. Use a ref.

---

### Bug: Progress bar frozen / showing stale time after tab switch

**Symptom:** After switching tabs, the progress bar stayed frozen at the position from before the tab switch.

**Root cause:** The progress polling interval in `usePreloadNextTrack` only runs when `isPlaying === true`. On tab switch, `isPlaying` local state resets to `false` (component re-renders), so the interval stopped and never restarted.

**Fix:** The polling effect also watches `isPlayingInStore` (from Zustand) as a fallback — the store value stays `true` across re-renders triggered by tab switch, so the interval restarts correctly.

---

## Progress bar

The progress bar is driven by a `setInterval` in `usePreloadNextTrack` polling `sound.seek() / sound.duration()` every 400ms. It is **not** event-driven. This means:

- Progress resets to 0 on song change (`currentSong.id` dep in the reset effect)
- If the interval stops (e.g. `isPlaying` goes false), progress freezes at the last polled value — this is intentional while paused
- `setProgress(0)` is also called in `PlayerContent` when `sound` becomes null during re-init

## Keyboard shortcuts (Player.tsx)

| Key | Action |
|-----|--------|
| `Space` | Toggle play/pause |
| `Escape` | Seek to 0 (restart) |
| `F8` | Stop (pause + seek to 0) |

Shortcuts are ignored when focus is on an `INPUT`, `TEXTAREA`, or `contentEditable` element.
