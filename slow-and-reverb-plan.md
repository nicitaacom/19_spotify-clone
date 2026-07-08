# Plan: `/slow-and-reverb` — client-side Slowed + Reverb editor page

> **For the AI implementing this:** Work through the TODO list below **in order, one step at a time**. After each step, stop and wait for the user's review before starting the next (standing user preference). Every UI decision must follow **`dev_readme-ui.md`** (Neon Design System) — read it before writing any JSX. Do not invent colors, shadows, or scroll containers; use the recipes in this document, which are derived from it.

---

## 1. Context

Add a standalone page at `/slow-and-reverb` replicating the slowedreverb.studio editor (user provided a screenshot): upload a **local** audio file, see a waveform seek bar, adjust **Speed**, **Reverb**, **Bass boost** live, apply **Slowed+Reverb** / **Nightcore** presets, and **Download** the processed result as MP3 or WAV. 100% client-side — no Supabase, no API routes, no global `usePlayer` store (so the bottom `<Player />` never conflicts).

Decisions already confirmed with the user — do **not** re-litigate:

- **Audio source:** local file only (drag & drop + file picker).
- **Pitch:** ~~linked to speed, display-only toggle, no pitch DSP~~ **superseded by §10.1:** toggle OFF = linked to speed (default); toggle ON = real independent pitch via a granular delay-based shifter (`lib/pitchShifter.ts`, no deps). No BETA badge.
- **Download:** ~~split button — main click = MP3, caret dropdown = MP3/WAV choice~~ **superseded by §9.6:** single button, MP3-only at 320 kbps.
- **"Pro" badges:** cosmetic only; nothing is gated, no auth checks. Format per §10.2: `PRO` chip + `- free for all` plain text outside it.
- **Styling:** screenshot's *layout*, but the app's neon/dark theme — **not** the screenshot's purple.
- **Timeline shows original track time** (waveform maps 1:1 to the decoded buffer; screenshot shows 4:14 original). Show effective output length (`duration / speed`) as small grey text near the Download button.

Codebase facts (verified — trust these, don't re-explore):

- Next.js 16 App Router, React 19, TypeScript, **pnpm**. Alias `@/*` → repo root.
- Pages: `app/(site)/<route>/page.tsx` = async server component rendering a `"use client"` component from `app/(site)/<route>/components/`. Mirror `app/(site)/my-songs/page.tsx` for the shell.
- Root layout wraps every page with `<Sidebar>` + global `<Player />`. Sidebar nav routes are hardcoded in `components/Sidebar.tsx` (`useMemo` array, lines ~30–59).
- There is **no Web Audio / waveform / effects code anywhere** in the repo. Playback elsewhere uses `use-sound`/Howler in `html5: true` mode — it cannot do effects; **do not touch or reuse it**.
- Reusable: `components/Button.tsx` (primary neon pill, forwardRef, accepts className), `components/Header.tsx`, `hooks/useOnEscOrClickOutside.ts`, `react-icons`, `react-hot-toast`, `tailwind-merge`, `@radix-ui/react-slider`.
- `components/Slider.tsx` is a Radix slider hardcoded to `max=1 step=0.1 aria-label="Volume"`, used by `components/PlayerContent.tsx` for volume. Extend it additively (Step 1).

---

## 2. TODO list

Work top to bottom. Check off items as they are completed. **Stop after each numbered step for user review.**

### Step 1 — Extend `components/Slider.tsx`
- [x] Add optional props: `min` (default `0`), `max` (default `1`), `step` (default `0.1`), `ariaLabel` (default `"Volume"`), `className` (merged with `twMerge`).
- [x] Keep all defaults identical to current hardcoded values so `PlayerContent.tsx` needs **zero changes**.
- [x] Verify: volume slider in the bottom player still works exactly as before.

### Step 2 — Audio engine (`lib/` + `hooks/useSlowReverbEngine.ts`)
- [x] `app/(site)/slow-and-reverb/lib/format.ts` — `formatTime(seconds): string` → `"m:ss"`.
- [x] `app/(site)/slow-and-reverb/lib/impulseResponse.ts` — `createImpulseResponse(ctx, seconds = 2.5, decay = 2.5)`.
- [x] `app/(site)/slow-and-reverb/lib/buildEffectsGraph.ts` — shared graph builder used by BOTH live playback and offline render.
- [x] `app/(site)/slow-and-reverb/hooks/useSlowReverbEngine.ts` — the full hook (API in §4).
- [x] Verify: no lint/type errors (targeted eslint + tsc on feature files pass; pre-existing project-wide issues ignored); logic reviewed (UI comes later, so no manual playback test yet).

### Step 3 — `Waveform.tsx`
- [x] `app/(site)/slow-and-reverb/components/Waveform.tsx` — canvas peaks, progress overlay, click/drag seek, play/pause overlay button, time row.
- [x] Verify: renders with a decoded buffer (ProBadge co-created for compile; skeleton test deferred to step 4 full editor).

### Step 4 — UI components + page
- [x] `components/ProBadge.tsx` (within the route folder) — cosmetic chip.
- [x] `components/FileDropZone.tsx` — drag&drop + picker empty state.
- [x] `components/EffectSliderRow.tsx` — generic slider row (used for Speed, Reverb, Bass).
- [x] `components/PitchToggleRow.tsx` — display-only pitch row.
- [x] `components/DownloadSplitButton.tsx` — split button (download handler stubbed until Step 5).
- [x] `components/SlowReverbEditor.tsx` — composes everything, owns the engine hook.
- [x] `page.tsx` — server component shell with `metadata` + `Header`.
- [x] Verify: full manual flow — load file, play, seek, sliders, presets (checklist §8, all items except download). (ProBadge created early for waveform; hook extended with clear() for UI.)

### Step 5 — Download / export
- [x] `pnpm add @breezystack/lamejs`
- [x] `lib/encodeWav.ts`, `lib/encodeMp3.ts`, `lib/renderOffline.ts`.
- [x] Wire `download(format)` in the engine hook and un-stub `DownloadSplitButton`.
- [x] Verify: MP3 + WAV export at 0.8x/40% reverb plays correctly in an external player.

### Step 6 — Sidebar nav entry
- [x] Add route to `components/Sidebar.tsx` routes array (after "My Songs"): icon `TbWaveSine` from `react-icons/tb`, label `"Slow & Reverb"`, `active: pathname.startsWith("/slow-and-reverb")`, `href: "/slow-and-reverb"`.
- [x] Verify: link shows, active state highlights per `dev_readme-ui.md` (SidebarItem already handles the neon glow).

---

## 3. Dependencies

Only one, added in **Step 5** (not before — keep earlier steps dependency-free):

```
pnpm add @breezystack/lamejs
```

Maintained lamejs fork (ESM + TS types; fixes the `MPEGMode` runtime crash of original lamejs). **No wavesurfer.js** — we already decode the file to an `AudioBuffer` for the effects graph, so a hand-rolled canvas peak renderer (~100 lines) is smaller and doesn't fight our custom source-node playback.

---

## 4. Audio engine — how to build it

### File: `lib/impulseResponse.ts`

```ts
createImpulseResponse(ctx: BaseAudioContext, seconds = 2.5, decay = 2.5): AudioBuffer
```
Stereo buffer, `length = seconds * ctx.sampleRate`; each channel sample = `(Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)`. Pure function; the hook caches one per context in a ref.

### File: `lib/buildEffectsGraph.ts`

Single source of truth for the node graph — used by the live `AudioContext` **and** the `OfflineAudioContext` render so what you hear is what you export.

```ts
interface EffectsParams { speed: number; reverb: number; bass: number } // reverb/bass 0–100

buildEffectsGraph(ctx: BaseAudioContext, buffer: AudioBuffer, params: EffectsParams): {
  source: AudioBufferSourceNode
  lowshelf: BiquadFilterNode
  wetGain: GainNode
  dryGain: GainNode
}
```

Topology:

```
AudioBufferSourceNode (playbackRate = speed)
        │
        ▼
BiquadFilter lowshelf (frequency = 200 Hz, gain = bass/100 * 12 dB)
        ├────────────────────────► dryGain (1.0) ────┐
        └► Convolver (2.5s noise IR) ► wetGain (reverb/100) ► ctx.destination
```

- dry gain stays constant `1.0`; only wet gain scales. Bass: 0–100% → 0..+12 dB.
- Connect both dryGain and wetGain to `ctx.destination` (no master gain needed).

### File: `hooks/useSlowReverbEngine.ts`

`"use client"`. Plain `useState`/`useRef` — **no zustand**, state is page-local.

```ts
interface SlowReverbEngine {
  loadFile(file: File): Promise<void>
  fileName: string | null
  buffer: AudioBuffer | null      // exposed for Waveform peaks + offline render
  duration: number                // ORIGINAL buffer duration in seconds
  isPlaying: boolean
  getPosition(): number           // current position in ORIGINAL-buffer seconds (rAF-safe, no setState)
  togglePlay(): void
  seek(seconds: number): void
  speed: number;  setSpeed(v: number): void   // 0.5–1.5, step 0.05, default 1
  reverb: number; setReverb(v: number): void  // 0–100, step 1, default 0
  bass: number;   setBass(v: number): void    // 0–100, step 1, default 0
  applyPreset(p: "slowed" | "nightcore"): void
  isRendering: boolean
  download(format: "mp3" | "wav"): Promise<void>  // Step 5; throw/no-op stub in Step 2
}
```

Implementation rules:

1. **Lazy context.** Create `AudioContext` on first `play()` (browser autoplay policy). Keep in a ref. `decodeAudioData` may use a temporary context or the same one created eagerly on `loadFile` + `resume()` on play — prefer: create context in `loadFile` (needed for decode), call `ctx.resume()` inside `togglePlay`.
2. **One-shot sources.** `AudioBufferSourceNode` can't restart. `play(offsetSec)`: build a fresh graph via `buildEffectsGraph`, `source.start(0, offsetSec)`, store anchor `{ startCtxTime: ctx.currentTime, startOffsetSec: offsetSec }`, increment a `generation` counter captured by `source.onended` — stale generations are ignored; a *natural* end sets position 0 + `isPlaying=false`.
3. **Position math.** `getPosition()` = playing ? `startOffsetSec + (ctx.currentTime - startCtxTime) * speedRef.current` : `pausedOffsetSec`. Clamp to `[0, duration]`.
4. **pause():** compute position → `pausedOffsetSec`, bump generation, `source.stop()`, disconnect nodes.
5. **seek(sec):** playing → stop current source and immediately `play(sec)`; paused → set `pausedOffsetSec` (and notify Waveform via a state tick or let Waveform read `getPosition()` on its next draw).
6. **Live param updates — never rebuild the graph:** `param.setTargetAtTime(value, ctx.currentTime, 0.03)` for `playbackRate`, `wetGain.gain`, `lowshelf.gain`. **Speed change while playing:** re-anchor FIRST (`startOffsetSec = getPosition(); startCtxTime = ctx.currentTime`), then update `playbackRate`.
7. **loadFile:** `file.arrayBuffer()` → `ctx.decodeAudioData`; on rejection `toast.error("Unsupported or corrupted audio file")` and keep previous state. On success: stop any playback, close+recreate context state, reset position to 0, set `fileName`/`buffer`. Keep params (speed/reverb/bass) as-is.
8. **Cleanup:** `useEffect` return → stop source, `ctx.close()`. Also close the old context when a new file loads.
9. **Presets:** `slowed` → `{speed: 0.8, reverb: 40}` (bass untouched); `nightcore` → `{speed: 1.25, reverb: 0}`. Route through the same setters so live playback updates. Active preset is **computed** (current values match preset), not stored.

---

## 5. Waveform — how to build it

File: `components/Waveform.tsx`. Props: `{ buffer, duration, isPlaying, getPosition, onSeek, onTogglePlay }`.

1. **Peaks:** on `buffer` change, compute ~1200 `{min, max}` buckets from channel 0 (average channels if you prefer; channel 0 is fine). Store in a ref — compute once, never per frame.
2. **Canvas:** parent-width responsive; `ResizeObserver` + `devicePixelRatio` scaling (`canvas.width = cssWidth * dpr`, `ctx.scale(dpr, dpr)`). Height ≈ 96px.
3. **Draw (two passes):** pass 1 — all peak bars in `#525252` (neutral-600); pass 2 — `ctx.save(); ctx.beginPath(); ctx.rect(0, 0, progressX, h); ctx.clip()` then redraw bars in neon `#4ade80`; `ctx.restore()`. Mirrored min/max bars around the vertical center like the screenshot. 1px gap between bars.
4. **Animation:** `requestAnimationFrame` loop active only while `isPlaying`; each frame reads `getPosition()`, redraws, and updates a **local** `currentTime` state (throttle label updates to ~4/sec; canvas redraws every frame). The parent must NOT re-render at 60fps.
5. **Seek:** `onPointerDown` → `setPointerCapture` → `fraction = clamp(x / cssWidth)` → `onSeek(fraction * duration)`; `onPointerMove` while captured = drag-scrub; `onPointerUp` releases. Bare waveform clicks seek — they do NOT toggle play.
6. **Play/pause:** centered circular overlay button (`FaPlay`/`FaPause` from react-icons) — primary button recipe from `dev_readme-ui.md`: `bg-neon text-black hover:bg-neon-strong`, add `shadow-neon-sm` while playing.
7. **Time row** below canvas: `formatTime(currentTime)` left, `formatTime(duration)` right, centered `<ProBadge />` between them (matches screenshot).

---

## 6. UI composition — how to build it (FOLLOW `dev_readme-ui.md`)

**Hard rules from the design system (violations = rework):**
- 60/30/10: page shell stays `bg-surface`; cards `bg-elevated`; **neon on at most 1–2 elements per region at rest** (here: the play button + progress fill; everything else neon only on hover/active).
- No `overflow-y-auto` on any page div — `<main>` in `Sidebar.tsx` is the single scroll container.
- Buttons: primary `bg-neon text-black font-bold hover:bg-neon-strong`; secondary `bg-elevated border border-neon/30 text-neon`; ghost `text-neutral-300 hover:text-white`.
- Inputs/drop zones: `bg-elevated border border-white/10 focus:border-neon/50 focus:ring-1 focus:ring-neon/30`.
- Header gradient: `bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent`.
- Shadows: `shadow-neon-sm` for active/playing, `shadow-neon` for hover only. Never `shadow-neon-lg` outside modals.

### `page.tsx` (server component, mirror `my-songs/page.tsx`)
- `export const metadata = { title: "Slow & Reverb" }` (match the metadata shape used by sibling pages).
- Shell: `div.h-full.w-full.overflow-x-hidden.rounded-lg.bg-surface.text-white` (NO overflow-y).
- `<Header>` with the gradient recipe above; title "Slow & Reverb", subtitle "Upload a track, slow it down, add reverb — all in your browser."
- Renders `<SlowReverbEditor />`.

### `SlowReverbEditor.tsx` (`"use client"`, owns `useSlowReverbEngine`)
Column layout `max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6`. Two states:

**Empty (buffer === null):** only `<FileDropZone onFile={loadFile} />`.

**Loaded — top to bottom (mirrors the screenshot):**
1. **Filename pill** — centered, `rounded-full bg-elevated border border-white/10 px-4 py-1.5 text-sm text-neutral-300 truncate max-w-full`, with a ghost "×" button that clears the file (confirm not needed — non-destructive, file is still on disk) and returns to the drop zone.
2. **`<Waveform />`** in a card: `rounded-xl border border-white/5 bg-elevated p-4 shadow-[0_4px_12px_rgba(0,0,0,0.5)]` (card recipe).
3. **Presets** — small `text-neutral-400` label "Presets", then two buttons: inactive = secondary-without-neon (`bg-elevated border border-white/10 text-neutral-300 hover:border-neon/30 hover:text-white`), active = secondary neon (`bg-elevated border border-neon/30 text-neon shadow-neon-sm`). Reuse `components/Button.tsx` with className overrides via twMerge.
4. **`<EffectSliderRow />`** × 2 — Speed and Reverb (specs below).
5. **`<PitchToggleRow />`**.
6. **`<EffectSliderRow />`** — Bass boost, with `<ProBadge />` in the label.
7. **`<DownloadSplitButton />`** centered, with small `text-neutral-500 text-xs` line under it: `Output length: {formatTime(duration / speed)}`.

### `FileDropZone.tsx`
- Card: `rounded-xl border-2 border-dashed border-white/10 bg-elevated/50 p-12 text-center cursor-pointer transition`.
- Dragover state: `border-neon/50 bg-elevated` (track with counter-based dragenter/dragleave to avoid child-element flicker).
- Hidden `<input type="file" accept="audio/*">` opened on click; also handle `onDrop` → `e.dataTransfer.files[0]`.
- Content: upload icon (`FiUploadCloud`), "Drop an audio file here or click to browse", supported-formats hint in `text-neutral-500 text-xs`.
- Validate `file.type.startsWith("audio/")` (or known extensions) before calling `onFile`; otherwise `toast.error`.

### `EffectSliderRow.tsx`
Generic row, props: `{ label, valueDisplay, value, min, max, step, defaultValue, onChange, badge? }`.
- Layout: label line centered above (`Speed (0.80x)` — label + formatted value + optional badge), then a row: **left** reset icon-button (`TbRefresh`, ghost style, resets to `defaultValue`), **center** extended `<Slider />` (from Step 1), **right** 3-dot button (`BsThreeDotsVertical`, ghost) opening a tiny absolute dropdown with one item "Reset" (same handler). Use `useOnEscOrClickOutside` for the dropdown.
- Value formatting is the caller's job: speed → `(0.80x)`, reverb/bass → `(40%)`.
- Slider styling: keep the component's white thumb/range (design system: neon only on 1–2 elements per region).

### `PitchToggleRow.tsx`
- Centered row: toggle (styled like a small Radix-free switch: `w-10 h-6 rounded-full bg-elevated border border-white/10` with a translating dot; ON state dot `bg-neon`), label `Pitch ({speed}x)`, `<ProBadge />`, and a `BETA` chip (`text-[10px] uppercase rounded-full px-1.5 py-0.5 bg-white/10 text-neutral-300`).
- Toggle is ON by default and functionally inert (pitch is always linked to speed); subtext `text-neutral-500 text-xs`: "Pitch follows speed (linked)". Keep it clickable-looking but a click just shows the subtext / does nothing — simplest honest behavior.

### `ProBadge.tsx`
`text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-neon/15 text-neon border border-neon/30`, content "Pro". Title attribute: "Free for everyone here".

### `DownloadSplitButton.tsx`
- Flex pair sharing one pill: main segment "Download" (primary recipe `bg-neon text-black font-bold hover:bg-neon-strong rounded-l-full`) + caret segment (`rounded-r-full border-l border-black/20`) opening a dropdown (`useOnEscOrClickOutside`) with items "MP3 (192 kbps)" and "WAV (lossless)".
- Main click = MP3. While `isRendering`: both segments disabled, spinner (`react-spinners` `BeatLoader` size 8) replaces the label.

---

## 7. Download / export — how to build it (Step 5)

### `lib/encodeWav.ts`
`encodeWav(buffer: AudioBuffer): Blob` — interleave channels, float→int16 with clamping (`Math.max(-1, Math.min(1, s)) * 0x7fff`), 44-byte RIFF/WAVE header, `new Blob([header, pcm], { type: "audio/wav" })`.

### `lib/encodeMp3.ts`
`encodeMp3(buffer: AudioBuffer, onProgress?: (pct: number) => void): Promise<Blob>`
- `import { Mp3Encoder } from "@breezystack/lamejs"` — `new Mp3Encoder(2, buffer.sampleRate, 192)`.
- Convert each channel Float32Array → Int16Array once, then encode in chunks of `1152 * 64` samples; between chunks `await new Promise(r => setTimeout(r, 0))` so the main thread breathes (NO Web Worker — deliberate simplicity choice); call `onProgress`.
- Mono input: duplicate the channel. Finish with `encoder.flush()`.

### `lib/renderOffline.ts`
`renderOffline(buffer, params: EffectsParams): Promise<AudioBuffer>`
- `length = Math.ceil((buffer.duration / params.speed + (params.reverb > 0 ? 2.5 : 0)) * buffer.sampleRate)` — slowed duration + reverb tail.
- `new OfflineAudioContext(2, length, buffer.sampleRate)` → `buildEffectsGraph(offCtx, buffer, params)` → `source.start(0)` → `await offCtx.startRendering()`.

### `download(format)` in the hook
1. Guard: `if (isRendering || !buffer) return`. Set `isRendering = true`.
2. `toast.loading("Rendering…", { id: "export" })` → `renderOffline` → encode (`toast.loading("Encoding… X%", { id: "export" })` from `onProgress`) → `toast.success("Downloaded", { id: "export" })`.
3. Filename: `${baseName} (slowed ${speed}x, reverb ${reverb}%).${format}` where baseName strips the original extension.
4. Trigger: `URL.createObjectURL(blob)` → temp `<a download>` click → `URL.revokeObjectURL`.
5. `try/catch` → `toast.error("Export failed", { id: "export" })`; `finally` → `isRendering = false`.

---

## 8. Verification checklist (run after Step 4, download items after Step 5)

- [ ] Load an MP3 via picker AND via drag&drop → filename pill + waveform appear.
- [ ] Drop a `.txt` → error toast, no crash, drop zone still usable.
- [ ] Play/pause via the overlay button; Space bar of the *global* player must not interfere (page never sets `usePlayer.activeId`).
- [ ] Click-seek and drag-scrub — while playing and while paused; time labels correct.
- [ ] Natural track end → playhead resets to 0:00, button shows Play.
- [ ] Change speed mid-play: **no position jump**, audible pitch shift, playhead advances at the new visual rate.
- [ ] Reverb 0→100 audibly wet, no clicks/zipper noise; bass boost audible at 100%.
- [ ] Presets set exact values (0.8/40 and 1.25/0), sliders + labels update, active preset gets neon border; per-row reset icons + 3-dot Reset work.
- [ ] Download MP3 and WAV at 0.8x + 40% reverb: file length ≈ `duration/0.8 + 2.5s`, plays in an external player, slowed+reverbed audibly identical to live preview; UI responsive during encode; progress toast updates.
- [ ] Load a second file mid-playback: old audio stops (no double audio), waveform/position reset.
- [ ] Navigate away mid-playback: audio stops (unmount cleanup).
- [ ] Sidebar shows "Slow & Reverb" with neon active state on the route; global bottom Player behavior unchanged.
- [ ] `pnpm lint` passes; page has no `overflow-y-auto` of its own; neon usage passes the 60/30/10 sanity check from `dev_readme-ui.md`.

---

## 9. Fix round 1 — post-review issues (reported 2026-07-08)

> User-reported issues after testing Steps 1–6. Same rules apply: follow `dev_readme-ui.md`, keep fixes surgical. These are small enough to land as **one step**, but check off each item and verify with §9.8 before reporting done.

### 9.1 Waveform overflows its card — `[ ]`

**Root cause (two compounding bugs in `components/Waveform.tsx`):**
1. `containerRef` sits on the padded card (`p-4`), and the resize handler uses `container.clientWidth`, which **includes the 32px horizontal padding**. `draw()` then sets `canvas.style.width = ${cssW}px`, overriding the `w-full` class — so the canvas is 32px wider than the card's content box and spills past the rounded right edge.
2. Bucket count is fixed at 1200 while `barWidth` is clamped to `Math.max(1, …)`. At ~600px width that draws 1200 × (1px bar + 1px gap) ≈ 2400px of bars into a ~600px bitmap — everything past the bitmap edge is silently clipped, so bar density is wrong too.

**Fix:**
- Move the measurement target to the canvas's own box: wrap `<canvas>` in an unpadded `div` (`w-full overflow-hidden`) and observe **that** element (or use `entry.contentRect.width` from the ResizeObserver). Never set `canvas.style.width` wider than the measured content box.
- Derive bucket count from width: `numBuckets = Math.floor(cssW / 3)` (≈ 2px bar + 1px gap fills the width exactly). Recompute peaks when `canvasWidth` or `buffer` changes — peak computation is cheap, no caching gymnastics needed.
- Belt-and-braces: add `overflow-hidden` to the card div.

### 9.2 Play button click also seeks — `[ ]`

**Root cause:** the card's `onPointerDown` seek handler fires **before** the overlay button's `onClick`; the `e.stopPropagation()` inside `onClick` is too late — the pointerdown has already seeked to the button's x-position (the center of the track).

**Fix:** add `onPointerDown={(e) => e.stopPropagation()}` to the overlay play/pause `<button>` in `Waveform.tsx` (keep the existing `onClick` stopPropagation too). Verify: pressing play/pause never moves the playhead.

### 9.3 ProBadge shape + text — `[ ]`

In `components/ProBadge.tsx`: replace `rounded-full` with `rounded-md`, and change the content from `Pro` to `"Pro" - free for all` (literal text, quotes included). Keep the neon chip colors. Check the three usage sites (Waveform time row, PitchToggleRow, Bass boost label) still lay out cleanly with the longer text — the time row's centered badge may need `whitespace-nowrap`.

### 9.4 Slider hover cursor — `[ ]`

In `components/Slider.tsx` (the shared component): add `cursor-pointer` to the `RadixSlider.Root` className (and to the Thumb). This intentionally also applies to the player volume slider — pointer cursor on a slider is correct there too. No API change.

### 9.5 Pitch switch does nothing on click — `[ ]`

**Constraint (locked decision):** pitch is always linked to speed; there is no pitch DSP, so the switch cannot change audio. But it must still *respond* — a dead control feels broken.

**Fix in `components/PitchToggleRow.tsx`:** make it a real controlled toggle: `const [on, setOn] = useState(true)`; click flips it. Dot slides `translate-x-[16px]` ↔ `translate-x-0` with `transition-transform duration-150`; ON dot `bg-neon`, OFF dot `bg-neutral-500`; button gets `cursor-pointer` (remove `cursor-default`). When OFF, dim the pitch value + badges (`opacity-50`). Subtext stays "Pitch follows speed (linked)" — audio behavior never changes.

### 9.6 Download: single button, best-quality MP3 — `[ ]`

Drop the split-button/dropdown design (supersedes the §1 decision):
- Replace `DownloadSplitButton.tsx` with a plain `DownloadButton.tsx`: one primary pill (`bg-neon text-black font-bold hover:bg-neon-strong rounded-full`), label "Download", `BeatLoader` while `isRendering`. Delete the dropdown, `useOnEscOrClickOutside` usage, and the WAV option.
- MP3 at **320 kbps** (lamejs's maximum): change `Mp3Encoder(2, sampleRate, 192)` → `320` in `lib/encodeMp3.ts`; update the engine hook so `download()` takes no format argument and only renders MP3.
- Remove the now-dead WAV path: delete `lib/encodeWav.ts` and the wav branch in the hook. Update §8 checklist expectations accordingly (MP3-only).

### 9.7 Replace 3-dot menu with BiReset — `[ ]`

In `components/EffectSliderRow.tsx`:
- Delete the right-side 3-dot button, its dropdown, the `menuOpen` state, and the `useOnEscOrClickOutside` usage (a one-item menu forcing two clicks is pointless).
- Also delete the **left** `TbRefresh` button — otherwise the row has two reset controls; the single reset lives where the 3-dots were.
- In its place: one icon button with `BiReset` from `react-icons/bi`; click → `onChange(defaultValue)`.
- Hover effect, explicitly 150ms: `text-neutral-400 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors duration-150`. `aria-label="Reset"`.

### 9.8 Verification for this round

- [x] Waveform bars end exactly at the card's inner edge at any window width (resize while loaded); no horizontal spill past the rounded corner.
- [x] Clicking play/pause never changes the playback position; clicking the waveform body still seeks.
- [x] Badge reads `"Pro" - free for all`, rounded-md, in all three locations.
- [x] Hovering any effect slider (and the volume slider) shows a pointer cursor.
- [x] Pitch switch animates on/off in 150ms; audio unaffected.
- [x] Single Download button; exported file is `.mp3`, 320 kbps (check with `ffprobe` or file properties); no WAV anywhere in UI or code.
- [x] Each slider row has exactly one `BiReset` icon (right side); click restores the default value; hover transition is 150ms.
- [x] `pnpm lint` passes; volume slider in the bottom player unaffected.

---

## 10. Fix round 2 — post-review issues (reported 2026-07-08)

> Same rules: follow `dev_readme-ui.md`, surgical changes, check off each item, verify with §10.4. **Item 10.1 is real feature work** (independent pitch DSP) — it supersedes the §1 "no pitch-shift DSP" decision and §9.5; do it last within this round.

### 10.1 Pitch must be a real, working control — and not BETA — `[ ]`

**What the user wants (matches the reference screenshot):** the Pitch toggle enables an actual pitch control with its own slider, decoupled from speed — exactly like Speed/Reverb rows. Remove the **BETA** badge entirely (keep the PRO badge).

**Semantics:**
- `pitch` = the desired *total* pitch multiplier of the output (range **0.5–1.5**, step 0.05).
- Toggle **OFF (default)** = linked mode: pitch follows speed (`pitch === speed`), slider hidden (or disabled) and the label shows the speed-derived value — current behavior, subtext "Pitch follows speed (linked)".
- Toggle **ON** = independent mode: a slider row appears under the toggle row (same `EffectSliderRow` layout with `BiReset`, default value = current `speed`), and the audio pitch is set independently of tempo.

**Implementation — granular delay-based pitch shifter (the Chrome "jungle" technique), no new dependencies:**
- New file `lib/pitchShifter.ts`: `createPitchShifter(ctx: BaseAudioContext): { input: AudioNode; output: AudioNode; setRatio(r: number, time: number): void }`. Built ONLY from standard nodes (two modulated `DelayNode` lines cross-faded by gain envelopes, driven by looping `AudioBufferSourceNode` sawtooth/fade curve buffers; grain delay ~0.10s, fade ~0.05s) so the **same code runs in `AudioContext` and `OfflineAudioContext`** — the export stays exactly what you hear. Do NOT use `source.detune` (it changes speed too) and do NOT add SoundTouchJS/AudioWorklet (offline-render integration pain).
- **Ratio math:** `playbackRate` already shifts pitch by `speed`, so the shifter must only supply the remainder: `ratio = pitchEnabled ? pitch / speed : 1`. Recompute on every `setSpeed`/`setPitch`/toggle change.
- **Bypass when linked:** at `ratio === 1` route audio around the shifter (or keep a parallel dry route switched by gains) so linked mode has zero added artifacts/latency. Insert point: `source → [pitchShifter] → lowshelf → …` in `buildEffectsGraph`; `EffectsParams` gains `pitch: number` and `pitchEnabled: boolean`, and `renderOffline.ts` passes them through — offline output must match live playback.
- **Engine API additions** in `useSlowReverbEngine.ts`: `pitchEnabled/setPitchEnabled`, `pitch/setPitch`. `setPitchEnabled(true)` initializes `pitch` to the current `speed` (no audible jump). While linked, `pitch` mirrors `speed` for display.
- **UI (`PitchToggleRow.tsx`):** toggle + `Pitch ({pitch}x)` + `<ProBadge />` — **delete the BETA chip**. When enabled, render the pitch slider row below (reuse `EffectSliderRow`); when linked, keep the subtext. Presets stay linked-mode (they don't touch pitch).
- **Known tradeoff (accept it):** granular shifting adds a slight doubling/graininess at extreme ratios — that's inherent to the technique and fine for this use case.

### 10.2 Badge: `PRO` inside, "- free for all" outside — `[ ]`

Current `ProBadge.tsx` renders `{'"Pro" - free for all'}` inside the chip (and `uppercase` makes it scream `"PRO" - FREE FOR ALL`). The user wants:
- **Inside the chip:** just `PRO` — no quotes, nothing else.
- **Outside the chip, right after it:** plain muted text `- free for all` (lowercase, NOT uppercase).

Fix: `ProBadge` returns an `inline-flex items-center gap-1.5 whitespace-nowrap` wrapper containing (1) the chip `<span>` with the existing neon classes and content `PRO`, and (2) `<span className="text-xs normal-case tracking-normal text-neutral-500">- free for all</span>` (explicitly reset `uppercase`/`tracking-wide` — put those classes on the chip span only, not the wrapper). Check all three usage sites (Waveform time row, Pitch row, Bass boost label) for layout with the wider footprint.

### 10.3 Consistent rounding: waveform card + filename pill — `[ ]`

Both containers must show clearly rounded corners (per `dev_readme-ui.md` card pattern):
- **Filename pill** in `SlowReverbEditor.tsx`: keep a visible radius consistent with the design system — use `rounded-lg` (the reference UI uses a rounded rectangle, not a full pill; drop `rounded-full` if present).
- **Waveform card** in `Waveform.tsx`: keep `rounded-xl overflow-hidden` on the outer card AND add `rounded-lg overflow-hidden` to the inner canvas wrapper so waveform bars are clipped to a rounded shape and never render a square edge against the card corner.
- Verify visually at both narrow and wide widths that no square corner shows on either element.

### 10.4 Verification for this round

- [ ] BETA badge is gone; PRO badge remains on Pitch and Bass boost.
- [ ] Toggle OFF: pitch label tracks the speed slider (speed 0.8 → "Pitch (0.80x)"), no pitch slider visible, audio identical to before this round (bypass active — no added artifacts).
- [ ] Toggle ON: pitch slider appears (defaulting to current speed); at speed 0.8 + pitch 1.0 the track plays slow WITHOUT the deep pitch drop; at speed 1.0 + pitch 0.8 the track plays at normal tempo but lower pitch.
- [ ] `BiReset` on the pitch row resets pitch to the linked value (current speed).
- [ ] Download at speed 0.8 + independent pitch 1.0: exported MP3 sounds identical to the live preview (offline graph includes the shifter).
- [ ] Badge renders as a neon `PRO` chip followed by muted `- free for all` text outside it, in all three locations.
- [ ] Filename pill and waveform card both show rounded corners; waveform bars never touch a square edge.
- [ ] `pnpm lint` passes.
