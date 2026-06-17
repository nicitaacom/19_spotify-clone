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
