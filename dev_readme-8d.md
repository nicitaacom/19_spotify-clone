# dev_readme — `/8d-generator` (steerable HRTF spatializer)

A standalone client-side page that turns a local audio file into "8D" audio: the sound is
placed at a point around the listener's head via a **single HRTF panner**, and 8 direction
sliders steer *where* that point sits. An **8D on/off** toggle A/Bs it against the clean
original. 100% in-browser — no Supabase, no API routes, no global `usePlayer` store.

> **History / why it's built this way.** The original plan was an *orbiting* source (sound
> rotates through 8 speakers). That was scrapped after testing: rotating felt wrong, and
> every "8 speakers at once" variant summed the same signal through multiple HRTF panners →
> **comb filtering** (a metallic "ripping"). The current design uses exactly **one** panner
> whose position the sliders steer — clean by construction. See §3.

---

## 1. Files

All under `app/(site)/8d-generator/` unless noted.

| File | Role |
| --- | --- |
| `lib/speakers.ts` | 8-speaker ring constants + the position math (`speakerPosition`, `weightedPosition`, `positionAngle`). Pure, no Web Audio. |
| `lib/build8dGraph.ts` | The node graph: `source → dry/wet crossfade around ONE HRTF panner → master`. Shared by live + offline. |
| `lib/renderOffline8d.ts` | `OfflineAudioContext` render for the MP3 export (same graph). |
| `hooks/use8dEngine.ts` | Load/decode, play/pause/seek, live slider→panner steering, dry/wet toggle, album-art + metadata, download. |
| `components/EightDEditor.tsx` | Owns the engine hook; two-column layout (mixers ⋮ ring + waveform). |
| `components/SpeakerRing.tsx` | Circular 8-chip visualizer + the source dot at the weighted position. |
| `components/MixerRow.tsx` | One direction slider (0 = that direction off). |
| `components/DownloadButton.tsx` | Primary pill, `BeatLoader` while rendering. |
| `page.tsx` | Server shell (`metadata`, neon `Header`). |

**Reused unchanged** from `app/(site)/slow-and-reverb/`: `FileDropZone`, `Waveform`,
`EffectSliderRow` (not currently used), `lib/format.ts`, `lib/encodeMp3.ts`,
`lib/id3AlbumArt.ts`. The sidebar nav entry lives in `components/Sidebar.tsx`
(`MdSurroundSound`, label "8D Generator", `/8d-generator`).

---

## 2. The 8 directions

`SPEAKERS` = Front (0°), Front Right (45°), Right (90°), Rear Right (135°), Rear (180°),
Rear Left (225°), Left (270°), Front Left (315°) — 45° apart, clockwise from front.

`speakerPosition(angleDeg)` maps an angle to a Web Audio position on the unit circle:
`{ x: sin, y: 0, z: -cos }` (listener faces −z, so Front = `(0,0,-1)`), radius 1 = `refDistance`.

---

## 3. The graph (`build8dGraph.ts`) — one panner, dry/wet crossfade

```
source ─► dryGain ─────────────────► master ─► destination   (clean, no panner)
       └► wetGain ─► HRTF panner ───► master                  (one spatialized position)
```

- **Exactly one `PannerNode`** (`panningModel: "HRTF"`). The 8 sliders do **not** each get a
  panner — together they compute a single position (`weightedPosition`, §4) that this one
  panner sits at. One panner ⇒ nothing to sum against ⇒ **no comb filtering**.
- **Dry/wet is a crossfade, not a sum.** 8D **off** → `dry 1 / wet 0` = the bit-clean
  original. 8D **on** → `dry 0 / wet 1` = fully spatialized. The engine ramps between them
  with `setTargetAtTime` so the toggle never clicks.
- The builder wires the graph but does **not** start the source — callers own that (live
  playback and the offline render both call it).
- Passive w.r.t. export: `renderOffline8d` uses the same builder, so the download matches
  what you hear.

---

## 4. Steering the panner (`weightedPosition`)

The 8 slider weights (each 0..1) are combined as a **weighted vector sum** of the speaker
directions:

```
pos = Σ (speakerPosition(angle_i) · weight_i) / Σ weight_i
radius = min(1, |pos|)
```

- Vector sum (not an average of raw degrees) so directions **wrap correctly** — e.g. a pull
  toward 350° and 10° averages to *front*, not to the back.
- `radius` is the "spread": 1 = pulled fully to one side, 0 = centered. Opposite channels
  balancing out shrink the radius toward center.
- All weights 0 → radius 0 (centered). Raising e.g. Right 80 + Rear 70 places the point
  between Right and Rear, leaning Right.
- `positionAngle(x, z)` inverts this back to a 0–360° angle for the ring dot.

`setMixerVolume(i, v)` updates the weight and, while playing, glides the live panner's
`positionX/Y/Z` with `setTargetAtTime` — the point moves smoothly, never jumps.

---

## 5. Engine hook (`use8dEngine.ts`)

Mirrors the `useSlowReverbEngine` lifecycle discipline (one-shot source + generation
counter; detach `onended` before a manual `stop()` so pause/seek don't run the natural-end
reset). Key surface:

```ts
loadFile / clear / fileName / albumArtUrl / buffer / duration / isPlaying
getPosition()                 // rAF-safe playhead
getCurrentGains()             // per-slider level 0..1 (ring chip glow)
getSourcePos()                // { angle, radius } of the single source (ring dot)
togglePlay() / seek()
mixerVolumes / setMixerVolume(i, v) / resetMixers()   // resetMixers → all 0 (centered)
enabled / setEnabled(v)       // 8D on/off; smooth dry/wet crossfade while playing
isRendering / download()      // OfflineAudioContext → encodeMp3 (320 kbps, "<base> (8D).mp3")
```

- Sliders **default to 0** (centered / clean). Raising one steers the sound that way.
- Metadata (cover art + title/artist/album) is extracted on load and re-embedded into the
  exported MP3 — see [dev_readme, shared export path]. `getCurrentGains` drives the neon chip
  glow; `getSourcePos` drives the source dot.

---

## 6. UI (`EightDEditor.tsx`, `SpeakerRing.tsx`, `MixerRow.tsx`)

Follows `dev_readme-ui.md` (neon/dark, 60/30/10, single `<main>` scroll container).

- **Empty state**: headphones hint + `FileDropZone`.
- **Loaded**: two columns — left = the 8 `MixerRow`s in a card with **Reset all** and the
  **8D: ON/OFF** toggle (power icon, neon fill when on, fixed-width label so it doesn't
  resize); right = filename pill, `SpeakerRing`, `Waveform`, download.
- `SpeakerRing`: 8 chips on a ring (raised channels glow neon) + a single neon **source dot**
  at `getSourcePos()` (angle + radius), driven by its own rAF loop (no setState).
- A "🎧 Use headphones" hint appears in both states (HRTF is meaningless on speakers).

---

## 7. Manual verification (headphones)

- Toggle **8D: ON/OFF** with all sliders at 0 → both sound identical & clean (proves no
  artifact / no comb filtering in the dry path).
- Raise **Right** → sound leans right, cleanly, no "ripping." Add **Rear** → the dot moves
  between them and the sound follows. Move sliders → the point glides, never jumps.
- Load via picker + drag-drop; drop a `.txt` → error toast, no crash. Album art shows.
- Pause/unpause resumes at the same position; natural end resets; new file mid-play stops the
  old audio; navigating away stops audio; the global bottom `Player` is unaffected (shared
  nothing).
- Download → stereo 320 kbps MP3, same length as source, spatialization matches the preview,
  source metadata preserved; UI stays responsive during encode.
