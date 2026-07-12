# Plan: `/8d-generator` — true 8D audio generator (8-speaker binaural mixer)

> **For the AI implementing this (Opus):** Work through the TODO list below **in order, one step at a time**. After each step, STOP and wait for the user's review before starting the next (standing user preference). Every UI decision must follow **`dev_readme-ui.md`** (Neon Design System) — read it before writing any JSX. Do not invent colors, shadows, or scroll containers; use the recipes in this document, which are derived from it. Web Audio lifecycle rules follow the same discipline as `dev_readme-player.md` and the proven `slow-and-reverb` engine ("a stale callback must never drive state").

---

## 1. Context

Add a standalone page at `/8d-generator` that turns any local audio file into **true 8D audio** — not the fake kind (a stereo pan LFO wobbling left/right), but real binaural spatialization: the sound physically orbits the listener's head through **8 virtual speakers** arranged in a circle (like the DTS speaker-ring demo the user referenced: Front, Front Right, Right, Rear Right, Rear, Rear Left, Left, Front Left).

**What makes it "true 8D":** each of the 8 speakers is a Web Audio `PannerNode` with `panningModel: "HRTF"` at a fixed 3D position around the head. HRTF (head-related transfer function) applies real interaural time/level differences and spectral cues, so on headphones the sound genuinely appears to come from behind/beside/in front — not just louder-left/louder-right.

**The "8 mixers":** each speaker has its own user-controlled volume slider (0–100%). The orbiting source crossfades between adjacent speakers; each mixer's slider scales its speaker's contribution. Turn a mixer to 0 and the sound audibly "skips" that direction as it orbits — the user can sculpt the orbit shape.

100% client-side — no Supabase, no API routes, no global `usePlayer` store (the bottom `<Player />` never conflicts).

### Locked decisions — do NOT re-litigate

- **Audio source:** local file only (drag & drop + file picker), same as `/slow-and-reverb`.
- **8 mixers exactly**, at 45° increments, clockwise from the front: `Front (0°), Front Right (45°), Right (90°), Rear Right (135°), Rear (180°), Rear Left (225°), Left (270°), Front Left (315°)`.
- **Orbit phase is derived from playback position, not wall-clock time** — `angle = 2π × position / rotationPeriod`. This makes seek deterministic and guarantees the offline export sounds identical to the live preview.
- **Controls:** 8 mixer volumes + **Rotation speed** (seconds per full revolution, 2–20 s, step 0.5, default 8) + **Direction** toggle (clockwise default). Nothing else — no reverb/speed/pitch on this page (that's what `/slow-and-reverb` is for).
- **Download:** single button, MP3-only at 320 kbps, reusing the existing `encodeMp3`.
- **Reuse over duplication:** import reusable code directly from `app/(site)/slow-and-reverb/` (`lib/format.ts`, `lib/encodeMp3.ts`, `lib/id3AlbumArt.ts`, `components/Waveform.tsx`, `components/FileDropZone.tsx`, `components/EffectSliderRow.tsx`, `components/ProBadge.tsx`). These are engine-agnostic. Do **not** copy-paste them; do **not** modify them (if a modification seems needed, stop and ask).
- **Headphones hint:** a small banner "🎧 Use headphones — 8D only works with headphones" (HRTF is meaningless on laptop speakers).
- **Styling:** the app's neon/dark theme per `dev_readme-ui.md` — the DTS screenshots inspire the *layout* of the speaker ring only, not colors.

### Codebase facts (verified 2026-07-12 — trust these, don't re-explore)

- Next.js App Router, React 19, TypeScript, **pnpm**. Alias `@/*` → repo root.
- Pages: `app/(site)/<route>/page.tsx` = async server component rendering a `"use client"` component from `app/(site)/<route>/components/`. Mirror `app/(site)/slow-and-reverb/page.tsx` for the shell.
- Root layout wraps every page with `<Sidebar>` + global `<Player />`. Sidebar nav routes are a hardcoded `useMemo` array in `components/Sidebar.tsx`.
- `@breezystack/lamejs` is already installed (Step 5 of the slow-and-reverb plan). **No new dependencies are needed for this feature.**
- Existing reusables in `app/(site)/slow-and-reverb/`:
  - `lib/format.ts` → `formatTime(seconds): string`
  - `lib/encodeMp3.ts` → `encodeMp3(buffer, onProgress?): Promise<Blob>` (320 kbps)
  - `lib/id3AlbumArt.ts` → `extractAlbumArt(data: ArrayBuffer): Blob | null`
  - `components/Waveform.tsx` — props `{ buffer, duration, isPlaying, getPosition, onSeek, onTogglePlay }`, fully engine-agnostic
  - `components/FileDropZone.tsx` — props `{ onFile(file: File) }`
  - `components/EffectSliderRow.tsx` — generic slider row `{ label, valueDisplay, value, min, max, step, defaultValue, onChange, badge? }` with `BiReset`
  - `components/ProBadge.tsx` — neon `PRO` chip + "- free for all"
  - `hooks/useSlowReverbEngine.ts` — the **reference implementation** for the play/pause/seek/one-shot-source/generation-counter pattern. Read it before writing `use8dEngine.ts`; copy its lifecycle discipline (§4).
- `components/Slider.tsx` (shared Radix slider) already accepts `min/max/step/ariaLabel/className` props.
- The scrollbar lives on `<main>` in `Sidebar.tsx` — inner page divs must NOT have their own `overflow-y-auto`.

---

## 2. TODO list

Work top to bottom. Check off items as they are completed. **Stop after each numbered step for user review.**

### Step 1 — Spatial math + graph builder (`lib/`)
- [ ] `app/(site)/8d-generator/lib/speakers.ts` — speaker constants + orbit gain math (§4.1).
- [ ] `app/(site)/8d-generator/lib/build8dGraph.ts` — shared node-graph builder used by BOTH live playback and offline render (§4.2).
- [ ] Verify: targeted `tsc --noEmit` + eslint pass on the new files; unit-sanity-check `orbitGains()` by hand (gains sum-of-squares ≈ 1, only 2 adjacent speakers nonzero).

### Step 2 — Engine hook (`hooks/use8dEngine.ts`)
- [ ] Full hook per §4.3: load/decode, play/pause/seek with the generation-counter pattern, rAF-driven orbit automation, live mixer/rotation updates, album art extraction.
- [ ] Verify: no lint/type errors; lifecycle logic reviewed against `useSlowReverbEngine.ts` (UI comes later — no manual playback test yet).

### Step 3 — Speaker ring visualizer (`components/SpeakerRing.tsx`)
- [ ] Circular 8-speaker visualization with a neon orbit dot + per-speaker glow proportional to current gain (§5).
- [ ] Verify: renders statically with mock props (dot at 0°, all gains equal).

### Step 4 — UI components + page
- [ ] `components/MixerRow.tsx` — one mixer channel strip row (§6).
- [ ] `components/EightDEditor.tsx` — composes everything, owns the engine hook (§6).
- [ ] `page.tsx` — server component shell with `metadata` + `Header` (§6).
- [ ] Verify: full manual flow — load file, play (sound orbits on headphones), seek, drag mixer sliders live, change rotation speed/direction live (checklist §8, all items except download).

### Step 5 — Download / export
- [ ] `lib/renderOffline8d.ts` — OfflineAudioContext render with `setValueCurveAtTime` orbit automation (§7).
- [ ] Wire `download()` in the engine hook + `components/DownloadButton.tsx` (plain primary pill, `BeatLoader` while rendering — mirror slow-and-reverb's).
- [ ] Verify: exported MP3 orbits identically to the live preview (spot-check with headphones at 0:00, mid-track, and with one mixer muted).

### Step 6 — Sidebar nav entry
- [ ] Add route to `components/Sidebar.tsx` routes array (after "Slow & Reverb"): icon `TbRotate360` from `react-icons/tb`, label `"8D Generator"`, `active: pathname.startsWith("/8d-generator")`, `href: "/8d-generator"`.
- [ ] Verify: link shows, neon active state per `dev_readme-ui.md`; `pnpm lint` passes repo-wide on touched files.

---

## 3. Dependencies

**None.** `@breezystack/lamejs` is already in `package.json`. Everything else is standard Web Audio (`PannerNode` HRTF works in every modern browser, including inside `OfflineAudioContext`).

---

## 4. Audio engine — how to build it

### 4.1 `lib/speakers.ts`

```ts
export interface Speaker { id: string; label: string; angleDeg: number }

export const SPEAKERS: readonly Speaker[] = [
  { id: "front",       label: "Front",       angleDeg: 0   },
  { id: "front-right", label: "Front Right", angleDeg: 45  },
  { id: "right",       label: "Right",       angleDeg: 90  },
  { id: "rear-right",  label: "Rear Right",  angleDeg: 135 },
  { id: "rear",        label: "Rear",        angleDeg: 180 },
  { id: "rear-left",   label: "Rear Left",   angleDeg: 225 },
  { id: "left",        label: "Left",        angleDeg: 270 },
  { id: "front-left",  label: "Front Left",  angleDeg: 315 },
] as const

export const SPEAKER_COUNT = 8
export const SECTOR = 45 // degrees between adjacent speakers
```

**Positions in Web Audio space** (listener at origin, default orientation faces −z): speaker at angle φ (degrees, clockwise from front) sits at radius 1 →

```ts
export function speakerPosition(angleDeg: number): { x: number; y: number; z: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: Math.sin(rad), y: 0, z: -Math.cos(rad) } // front (0°) = (0, 0, -1)
}
```

Radius 1 = `refDistance`, so the PannerNode's distance attenuation is exactly 1 for every speaker — mixers start perfectly balanced.

**Orbit gain math — pairwise equal-power panning around the ring.** The virtual source at angle θ excites only the two adjacent speakers, with an equal-power crossfade (constant perceived loudness, no clicks):

```ts
/** Gains for all 8 speakers when the source is at angleDeg. Sum of squares === 1. */
export function orbitGains(angleDeg: number): number[] {
  const a = ((angleDeg % 360) + 360) % 360
  const lower = Math.floor(a / SECTOR) % SPEAKER_COUNT      // speaker just behind the source
  const upper = (lower + 1) % SPEAKER_COUNT                 // speaker just ahead
  const f = (a - lower * SECTOR) / SECTOR                   // 0..1 within the sector
  const gains = new Array<number>(SPEAKER_COUNT).fill(0)
  gains[lower] = Math.cos((f * Math.PI) / 2)
  gains[upper] = Math.sin((f * Math.PI) / 2)
  return gains
}

/** Orbit angle for a given playback position. Direction: 1 = clockwise, -1 = counter-clockwise. */
export function orbitAngle(positionSec: number, periodSec: number, direction: 1 | -1): number {
  return direction * (positionSec / periodSec) * 360
}
```

Pure functions, no Web Audio imports — trivially testable by hand.

### 4.2 `lib/build8dGraph.ts`

Single source of truth for the node graph — used by the live `AudioContext` AND the `OfflineAudioContext` render, so what you hear is what you export.

```ts
export interface EightDParams {
  rotationPeriod: number      // seconds per revolution, 2–20
  direction: 1 | -1           // 1 = clockwise
  mixerVolumes: number[]      // length 8, each 0–1 (slider % / 100)
}

export interface EightDGraph {
  source: AudioBufferSourceNode
  orbitGains: GainNode[]      // length 8 — automated by the orbit (engine or offline curve)
  userGains: GainNode[]       // length 8 — the mixer sliders
  master: GainNode
}

export function build8dGraph(ctx: BaseAudioContext, buffer: AudioBuffer, params: EightDParams): EightDGraph
```

Topology (per speaker i of 8):

```
AudioBufferSourceNode
        │
        ├─► orbitGain[i] (auto, starts at orbitGains(0)[i]) ─► userGain[i] (mixerVolumes[i]) ─► PannerNode[i] ─► master ─► ctx.destination
        ├─► ... (×8)
```

PannerNode setup per speaker (position from `speakerPosition(SPEAKERS[i].angleDeg)`):

```ts
const p = new PannerNode(ctx, {
  panningModel: "HRTF",
  distanceModel: "inverse",
  refDistance: 1,
  positionX: pos.x, positionY: pos.y, positionZ: pos.z,
})
```

- `master.gain.value = 1`. Because orbit gains are equal-power (sum of squares = 1) and at most 2 panners are active, there is no clipping headroom problem; do not add compensation hacks.
- Set initial orbit gains from `orbitGains(orbitAngle(startOffsetSec, period, direction))` so playback starting mid-track begins at the correct orbit position.
- The builder does NOT start the source and does NOT automate anything over time — callers own that (live: rAF; offline: value curves).

### 4.3 `hooks/use8dEngine.ts`

`"use client"`. Plain `useState`/`useRef` — no zustand, state is page-local. **Read `app/(site)/slow-and-reverb/hooks/useSlowReverbEngine.ts` first and copy its structure** — it already solves every lifecycle bug this page could have.

```ts
interface EightDEngine {
  loadFile(file: File): Promise<void>
  clear(): void
  fileName: string | null
  albumArtUrl: string | null
  buffer: AudioBuffer | null
  duration: number
  isPlaying: boolean
  getPosition(): number                    // rAF-safe, no setState
  getOrbitAngle(): number                  // current orbit angle in degrees — for SpeakerRing
  getCurrentGains(): number[]              // orbitGains × userVolumes — for SpeakerRing glow
  togglePlay(): void
  seek(seconds: number): void
  rotationPeriod: number; setRotationPeriod(v: number): void   // 2–20 s, step 0.5, default 8
  direction: 1 | -1;      setDirection(v: 1 | -1): void
  mixerVolumes: number[];  setMixerVolume(i: number, v: number): void  // 0–100 in UI, /100 in graph
  isRendering: boolean
  download(): Promise<void>                // Step 5; stub until then
}
```

Implementation rules (deltas from `useSlowReverbEngine.ts` — everything not listed here is IDENTICAL to that hook):

1. **Same one-shot source + generation counter pattern**, same `src.onended = null` before `src.stop()` in `stopCurrent()` (the §12.3 resume-bug fix — do not regress it), same lazy context + `ctx.resume()` in `togglePlay`, same decode/detached-buffer handling (`extractAlbumArt` BEFORE `decodeAudioData`, or decode a `.slice(0)`), same cleanup on unmount/new-file/clear.
2. **Orbit automation (live):** while playing, a `requestAnimationFrame` loop inside the hook computes `angle = orbitAngle(getPosition(), rotationPeriod, direction)` then, for each speaker, `orbitGain[i].gain.setTargetAtTime(g[i], ctx.currentTime, 0.05)`. The 50 ms time constant smooths the ~60 Hz updates into clickless ramps. The loop starts in `playFromOffset` and is cancelled in `stopCurrent`. It must NOT call setState (no 60 fps re-renders) — the SpeakerRing reads `getOrbitAngle()`/`getCurrentGains()` in its own rAF loop.
3. **Live mixer changes:** `setMixerVolume(i, v)` updates React state (slider position) AND, if a graph is live, `userGain[i].gain.setTargetAtTime(v / 100, ctx.currentTime, 0.03)`. Never rebuild the graph for a param change.
4. **Rotation period / direction changes while playing:** to avoid the orbit angle jumping (position is fixed but `angle = f(position, period)` changes discontinuously), keep a **phase offset ref**: on every `setRotationPeriod`/`setDirection` while playing, compute the current angle first, then update the param, then set `phaseOffsetRef` so the new formula yields the same angle at the current position (`angle = phaseOffset + orbitAngle(position, newPeriod, newDirection)`). The rAF loop and the offline render both apply `phaseOffsetRef`. On seek or new file, reset `phaseOffsetRef` to 0 (deterministic export: export always renders with phase 0 — acceptable, document it in a comment).
5. **getCurrentGains():** `orbitGains(currentAngle)[i] × mixerVolumesRef.current[i] / 100` — read refs, not state, so it's rAF-safe.
6. **Mixer defaults:** all 8 at 100. `clear()` keeps mixer/rotation settings (non-destructive, same principle as slow-and-reverb keeping params across files).

---

## 5. Speaker ring visualizer — how to build it

File: `components/SpeakerRing.tsx`. Props: `{ isPlaying, getOrbitAngle, getCurrentGains, mixerVolumes }`.

Layout (plain divs + trig — no canvas needed; only 9 moving elements):

1. **Container:** square, responsive: `relative w-full max-w-[420px] aspect-square mx-auto`. Inside it, a ring: `absolute inset-4 rounded-full border border-white/10` and a fainter inner ring `absolute inset-16 rounded-full border border-white/5` (echoes the DTS turntable look, dark and subtle).
2. **8 speaker chips**, absolutely positioned on the ring circumference via trig (`left: 50% + 46% × sin(φ)`, `top: 50% − 46% × cos(φ)`, `translate(-50%,-50%)`): rounded square `w-12 h-12 rounded-lg bg-elevated border border-white/10 flex items-center justify-center` with a speaker icon (`HiSpeakerWave` from `react-icons/hi2`) + tiny label under it (`text-[9px] text-neutral-500 uppercase tracking-wide`). Front chip (0°) at the top, mirroring the screenshots.
3. **Live glow:** each chip's own rAF-driven style (see 5) sets `boxShadow: 0 0 ${12 × gain}px rgba(74,222,128,${0.6 × gain})` and `borderColor: rgba(74,222,128,${0.5 × gain})` from `getCurrentGains()[i]`. At rest (paused) all gains render 0 — chips are plain `bg-elevated`. This respects the 60/30/10 rule: neon appears only on the 1–2 chips the sound is currently passing through.
4. **Orbit dot:** one `absolute w-3 h-3 rounded-full bg-neon shadow-neon-sm` positioned each frame at the current angle on a slightly smaller radius (40%). Hidden (`opacity-0`) when not playing.
5. **Animation without re-renders:** one `requestAnimationFrame` loop (active only while `isPlaying`) inside SpeakerRing reads `getOrbitAngle()`/`getCurrentGains()` and writes styles imperatively via refs (`el.style.transform`, `el.style.boxShadow`). No setState in the loop. Cancel on pause/unmount.
6. **Muted mixers:** when `mixerVolumes[i] === 0`, render the chip at `opacity-40` with a strike-through-style muted icon (`HiSpeakerXMark`) — instant visual feedback that the orbit will skip it.
7. **Center:** small `text-neutral-600 text-xs uppercase tracking-widest` label "8D" (or the headphones emoji) — decorative only.

---

## 6. UI composition — how to build it (FOLLOW `dev_readme-ui.md`)

**Hard rules from the design system (violations = rework):**
- 60/30/10: page shell `bg-surface`; cards `bg-elevated`; neon at rest only on the play button + the orbiting glow. Mixer sliders stay white/neutral.
- No `overflow-y-auto` on any page div — `<main>` in `Sidebar.tsx` is the single scroll container.
- Buttons: primary `bg-neon text-black font-bold hover:bg-neon-strong`; ghost `text-neutral-300 hover:text-white`.
- Cards: `rounded-xl border border-white/5 bg-elevated shadow-[0_4px_12px_rgba(0,0,0,0.5)]`.
- Header gradient: `bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent`.
- `shadow-neon-sm` for active/playing, `shadow-neon` for hover only.

### `page.tsx` (server component, mirror `slow-and-reverb/page.tsx`)
- `export const metadata = { title: "8D Generator" }` (match sibling pages' metadata shape).
- Shell: `div.h-full.w-full.overflow-x-hidden.rounded-lg.bg-surface.text-white` (NO overflow-y).
- `<Header>` with the gradient recipe; title "8D Generator", subtitle "Upload a track and make it orbit your head — true 8D, in your browser."
- Renders `<EightDEditor />`.

### `EightDEditor.tsx` (`"use client"`, owns `use8dEngine`)

**Empty (buffer === null):** centered `max-w-2xl mx-auto px-6 py-8`: headphones hint banner (see below) + `<FileDropZone onFile={loadFile} />` (imported from slow-and-reverb).

**Loaded — two-column** (`max-w-5xl mx-auto px-6 py-8 grid md:grid-cols-2 gap-8 items-start`, mobile: single column, media first via `md:order-*` — same pattern as SlowReverbEditor):
- **Right column (media, `md:order-2`):** filename pill (same recipe as SlowReverbEditor: `rounded-lg bg-elevated border border-white/10 px-4 py-1.5 text-sm text-neutral-300 truncate` + ghost "×" → `clear()`) → `<SpeakerRing />` in a card → `<Waveform />` (imported) in a card → rotation controls: one `<EffectSliderRow />` (imported) for Rotation speed (`label "Rotation"`, valueDisplay `(8.0s / rev)`, min 2, max 20, step 0.5, default 8) + a Direction toggle row (two small buttons "CW" / "CCW", active = secondary neon `bg-elevated border border-neon/30 text-neon`, inactive = `border-white/10 text-neutral-300`).
- **Left column (mixers, `md:order-1`):** card containing the 8 `<MixerRow />`s stacked with `divide-y divide-white/5`, a `text-neutral-400 text-sm` heading "Mixers", and a ghost "Reset all" button (`BiReset`, sets all to 100). Below the card: `<DownloadButton />` centered + headphones hint.
- **Headphones hint** (both states): `flex items-center justify-center gap-2 text-neutral-500 text-xs` — "🎧 Use headphones — 8D only works with headphones".

### `MixerRow.tsx`
Props: `{ label, value, onChange, muted }`. One horizontal row: speaker label (`text-sm text-neutral-300 w-24 shrink-0`), the shared `<Slider />` (`min 0, max 100, step 1, ariaLabel: \`${label} volume\``), percentage readout (`text-xs text-neutral-500 w-10 text-right tabular-nums`), and a mute icon-button (ghost, `HiSpeakerXMark`/`HiSpeakerWave`, toggles between 0 and the last nonzero value kept in a local ref). Slider thumb/range stay white (neon budget is spent on the ring).

### `DownloadButton.tsx`
Mirror `slow-and-reverb/components/DownloadButton.tsx`: primary pill, label "Download", `BeatLoader` size 8 while `isRendering`, disabled while rendering. Under it: `text-neutral-500 text-xs` line `Output: MP3 320 kbps · {formatTime(duration)}`.

---

## 7. Download / export — how to build it (Step 5)

### `lib/renderOffline8d.ts`

```ts
renderOffline8d(buffer: AudioBuffer, params: EightDParams): Promise<AudioBuffer>
```

1. `new OfflineAudioContext(2, Math.ceil(buffer.duration * buffer.sampleRate), buffer.sampleRate)` — output length = input length (no tail; the orbit adds no reverb). Output is stereo regardless of source channel count (HRTF renders binaural stereo).
2. `build8dGraph(offCtx, buffer, params)` — identical graph to live playback.
3. **Orbit automation via value curves:** for each speaker i, precompute a `Float32Array` sampled at 50 Hz over the full duration: `curve[k] = orbitGains(orbitAngle(k / 50, period, direction))[i]`, then `orbitGain[i].gain.setValueCurveAtTime(curve, 0, buffer.duration)`. (Phase offset is always 0 for export — locked decision in §4.3.4.) 50 Hz sampling of a ≥2 s rotation is far above the Nyquist rate of the gain envelope — inaudible stepping, and `setValueCurveAtTime` interpolates linearly between points anyway.
4. `source.start(0)` → `await offCtx.startRendering()`.

### `download()` in the hook
Identical flow to `useSlowReverbEngine.download()`:
1. Guard `if (isRendering || !buffer) return`; `isRendering = true`.
2. `toast.loading("Rendering…", { id: "export" })` → `renderOffline8d` → `encodeMp3` (imported; progress toasts) → `toast.success("Downloaded", { id: "export" })`.
3. Filename: `${baseName} (8D ${rotationPeriod}s).mp3`.
4. `URL.createObjectURL` → temp `<a download>` click → revoke. `try/catch` → `toast.error("Export failed", { id: "export" })`; `finally` → `isRendering = false`.

---

## 8. Verification checklist (run after Step 4; download items after Step 5)

**All listening tests require headphones.**

- [ ] Load an MP3 via picker AND drag&drop → filename pill, speaker ring, waveform appear; album art extracted when present.
- [ ] Drop a `.txt` → error toast, no crash.
- [ ] Play: the sound audibly orbits the head — clearly *behind* when the dot is at Rear (not just "both ears quieter"). Dot + chip glow track the audible position (front chip glows when sound is in front).
- [ ] One full revolution takes exactly `rotationPeriod` seconds (time it at 8 s).
- [ ] Change rotation speed mid-play: orbit smoothly speeds up/slows down with **no angle jump** (§4.3.4 phase offset). Direction toggle reverses the orbit smoothly.
- [ ] Drag a mixer to 0 mid-play: that direction goes silent as the orbit passes it, no clicks; chip shows muted state; restore works.
- [ ] Mute Rear + Rear Left + Rear Right → sound only sweeps across the front arc.
- [ ] Seek while playing and while paused: position + orbit angle stay consistent (angle is a function of position).
- [ ] Pause → unpause resumes from the same position AND same orbit angle (no §12.3-class regression).
- [ ] Natural track end → playhead resets to 0:00, ring goes idle (no glow, dot hidden).
- [ ] Load a second file mid-playback: old audio stops, no double audio. Navigate away mid-playback: audio stops.
- [ ] Global bottom Player unaffected; playing a library song and the 8D preview never fight over state (they share nothing).
- [ ] Download: exported MP3 is stereo 320 kbps, same length as source, orbit matches the live preview (spot-check 3 moments); mixer settings (e.g. muted rear) are honored in the export; UI stays responsive during encode.
- [ ] Sidebar shows "8D Generator" with neon active state on the route.
- [ ] `pnpm lint` + `tsc --noEmit` pass; no page div has `overflow-y-auto`; neon at rest limited to play button + ring glow (60/30/10 sanity check).

---

## 9. New/modified files summary

New (all under `app/(site)/8d-generator/` unless noted):
- `page.tsx`
- `lib/speakers.ts`, `lib/build8dGraph.ts`, `lib/renderOffline8d.ts`
- `hooks/use8dEngine.ts`
- `components/EightDEditor.tsx`, `components/SpeakerRing.tsx`, `components/MixerRow.tsx`, `components/DownloadButton.tsx`

Modified:
- `components/Sidebar.tsx` (one nav entry)

Imported unchanged from `app/(site)/slow-and-reverb/`: `lib/format.ts`, `lib/encodeMp3.ts`, `lib/id3AlbumArt.ts`, `components/Waveform.tsx`, `components/FileDropZone.tsx`, `components/EffectSliderRow.tsx`, `components/ProBadge.tsx`.
