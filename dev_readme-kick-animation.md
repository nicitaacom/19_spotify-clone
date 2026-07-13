# dev_readme — kick-reactive album-art pulse (`/slow-and-reverb`)

How the `/slow-and-reverb` background image pulses **on kicks and 808s only** — not on hats,
claps, or vocals — with a scale/strength that looks the same across loud and quiet tracks.

> This replaced an earlier spectral-flux-on-dB-bytes approach that "caught everything" and
> whose pulse magnitude "didn't depend on the song." See §5 for why that failed.

---

## 1. Pipeline at a glance

```
source (clean, pre-effects)
   └─► lowpass ×2 (120 Hz)  ─►  kickAnalyser        [passive tap, never hits destination]
                                     │
                    getKickLevel():  │  getFloatTimeDomainData → RMS
                                     ▼
                            kickDetector.update(rms, now)  →  onset strength 0..1
                                     │
                                     ▼
                     AlbumArt rAF loop: attack → decay envelope → scale + blur
```

Three files:

| File | Role |
| --- | --- |
| [`lib/buildEffectsGraph.ts`](./app/(site)/slow-and-reverb/lib/buildEffectsGraph.ts) | The passive **tap chain**: `source → lowpass×2(120Hz) → kickAnalyser`. |
| [`lib/kickDetector.ts`](./app/(site)/slow-and-reverb/lib/kickDetector.ts) | Pure, hand-testable **onset detector** — RMS in, 0..1 strength out. |
| [`components/AlbumArt.tsx`](./app/(site)/slow-and-reverb/components/AlbumArt.tsx) | **Animation only**: eases the pulse up on a hit and back to rest. |

The hook [`useSlowReverbEngine.ts`](./app/(site)/slow-and-reverb/hooks/useSlowReverbEngine.ts)
glues them: it owns `kickAnalyser`, a reused `Float32Array`, and a per-play `KickDetector`,
and exposes `getKickLevel(): number`.

---

## 2. The tap chain (`buildEffectsGraph.ts`)

```ts
source → lowpass(120Hz, Q0.707) → lowpass(120Hz, Q0.707) → kickAnalyser (fftSize 1024)
```

- **Tapped off `source`** (pre-pitch-shifter, pre-bass-boost, pre-reverb). Rationale:
  - The granular pitch-shifter's grain crossfades amplitude-modulate the signal (~10–20 Hz);
    tapping after it would leak that wobble into the measured low band as phantom "kicks."
  - The Bass slider is a uniform boost inside the band, and the detector normalizes by the
    track's own average (§3), which cancels uniform gain — so "react to what you hear" holds
    in practice without tapping post-effects.
  - The reverb tail can't trigger pulses because the tap is pre-convolver by construction.
- **Two cascaded lowpasses at 120 Hz** → 24 dB/oct. Treble is *gone*, not merely −12 dB
  "quieter," so hats/claps/vocals are invisible to the detector **before** measurement.
  Frequency selectivity via real filters, **no bin-index math anywhere**.
- **Cutoff 120 Hz**: kick fundamentals ~40–100 Hz; at speed 0.5 they halve (still in band),
  at 1.5 they reach ~150 Hz (the −3 dB knee + RMS window still registers them). Do not raise
  above ~150 (toms/claps start leaking in).
- **Passive dead-end**: `kickAnalyser` never connects to `destination`, so it's inert on the
  export `OfflineAudioContext` — downloads are unaffected.

---

## 3. The detector (`lib/kickDetector.ts`)

A pure closure (no React, no Web Audio) so the algorithm is testable with plain numbers:

```ts
const d = createKickDetector()
d.update(rms, performance.now()) // → 0..1 onset strength (0 on non-onset frames)
d.reset()
```

**Algorithm** (`update(rms, nowMs)`), in order:

1. Push `rms` into a fixed circular buffer (`Float32Array(HISTORY_LEN)`), keeping an O(1)
   running sum. The spike **itself** joins the average → back-to-back kicks progressively
   adapt (get less shocking), which is correct.
2. Before `WARMUP_FRAMES` samples seen → return 0 (~200 ms settle after each play/seek).
3. `mean = sum / count`. If `rms < ABS_FLOOR` or `mean < ABS_FLOOR/2` → return 0 (silence /
   near-silence guard; also prevents divide-by-tiny blow-ups in quiet intros / between songs).
4. Within `REFRACTORY_MS` of the last onset → return 0 (one kick can't double-fire).
5. `ratio = rms / mean`. If `ratio ≤ TRIGGER_RATIO` → return 0.
6. Onset: record the time, return `min(1, (ratio − TRIGGER_RATIO) / (FULL_RATIO − TRIGGER_RATIO))`.

**Why it's song-independent:** `ratio` compares the instant sub-bass energy to the *same
track's* last ~0.7 s. A quiet lo-fi track and a slammed EDM master both idle near `ratio ≈ 1`
and both spike to 2–4× on a kick → identical mapping to visual strength. Sustained 808 tails
raise the mean within a few frames, so the ratio falls back toward 1 and the pulse releases.

**Tuning knobs** (the only ones — exported for tests):

| Constant | Value | Meaning |
| --- | --- | --- |
| `HISTORY_LEN` | 43 | ~0.7 s @ 60 fps — the "recent average" window |
| `WARMUP_FRAMES` | 12 | frames of silence-safe warm-up after play/seek |
| `ABS_FLOOR` | 0.008 | linear RMS (~−42 dBFS) silence gate |
| `TRIGGER_RATIO` | 1.5 | fire above 1.5× recent mean |
| `FULL_RATIO` | 3.0 | 3×+ mean = full-strength pulse |
| `REFRACTORY_MS` | 120 | min gap between onsets |

---

## 4. The animation (`AlbumArt.tsx`)

The component receives ready onset strengths and only animates them. In the rAF loop:

```
hit = getKickLevel()                       // 0..1, 0 on non-kick frames
if hit > target: target = hit              // a kick raises the target
target *= exp(-dt / DECAY_TAU_MS)          // target releases over time
tau = target > env ? ATTACK_TAU_MS : DECAY_TAU_MS
env += (target - env) * (1 - exp(-dt/tau)) // env eases toward target
scale = REST_SCALE + env * KICK_RANGE      // 0.97 → 1.0, NEVER above 1.0
blur  = env * MAX_BLUR
```

- A kick **eases up** over `ATTACK_TAU_MS` then **releases** over `DECAY_TAU_MS` — the whole
  swell-and-fall gesture is ≈ 150 ms, not an instant snap.
- All time constants use the rAF timestamp delta (`dt`), so the feel is **identical at 60 or
  144 Hz**.
- **Scale is clamped to `[REST_SCALE, 1.0]`** by construction (`REST_SCALE + env·KICK_RANGE`,
  `env ≤ 1`, `REST_SCALE + KICK_RANGE = 1.0`). It never scales **above** 1.0, so the
  `inset-0` background can't overflow its container — that overflow was causing page scroll.
- The `<img>` carries a base `scale(1.12)` overfill so that at `REST_SCALE` (0.97) it still
  covers the container with no dark margin. When the track is pitched down, `animate-kenburns`
  owns the img transform instead.
- On pause: a 300 ms CSS transition eases scale/blur back to rest; `env`/`target` reset to 0.

**Visual constants:**

| Constant | Value | Meaning |
| --- | --- | --- |
| `REST_SCALE` | 0.97 | scale at rest / between kicks |
| `KICK_RANGE` | 0.03 | a full kick adds this (0.97 → 1.0) |
| `MAX_BLUR` | 1.5 px | blur at a full-strength kick |
| `ATTACK_TAU_MS` | 55 | rise time constant |
| `DECAY_TAU_MS` | 95 | fall time constant |

---

## 5. Why the previous approach failed (do not reintroduce)

The old detector used `getByteFrequencyData` (dB-scaled 0–255 bytes) + a fixed-bin sub-bass
average minus a treble penalty, with spectral flux (`rise > GATE`) in `AlbumArt`.

1. **Byte-dB saturation** — on a loud master the sub-bass bins sit near 255 almost
   continuously, so the frame-to-frame "rise" was tiny quantized-dB jitter, roughly the same
   size on every track → "same scale regardless of song."
2. **Self-defeating treble penalty** — some bin in the huge ~4–17 kHz range is hot almost
   every moment (air, cymbals, vocals), so `low − 0.8·hi` was a small noisy residual that
   fired on any transient → "catches everything."
3. **Fixed gate/gain constants can't generalize** — nothing normalized to the track's own
   energy.

The fix: measure **real linear energy** (time-domain RMS of a band-limited tap), detect
**relative** to the track's own recent average, and select frequency with **filters, not
bins**. That makes hats/claps invisible and pulse strength song-independent by construction.

---

## 6. Manual verification (there are no automated audio tests)

Listening checks (headphones):

- Trap track with sparse kicks: one pulse per kick, ignores hi-hat rolls and claps between.
- Sustained 808: one pulse on the attack, releases during the tail (doesn't stay scaled up).
- Loud EDM vs quiet lo-fi: pulse strength looks comparable; neither under-fires nor pins.
- Vocals/instrument-only passage: art stays at rest.
- Speed 0.6 / 1.5, pitch −12 st, bass 0→100, reverb 100%: kicks still tracked, no phantom
  pulsing; timing matches what you hear.
- Pause/unpause, natural end, new file, navigate away: no errors, no stuck animation.
- Export at any settings: MP3 unchanged (tap is passive).

The detector's step logic is covered by a hand-run numeric simulation (spike → one
full-strength onset; too-soon second spike blocked by refractory; moderate spike →
proportional strength; silence → zero) — not a committed test, but the math is pinned.
