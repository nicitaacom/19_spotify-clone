# UI Theming — Neon Design System

## Color tokens (tailwind.config.ts)

| Token                  | Value                 | Role                                                          |
| ---------------------- | --------------------- | ------------------------------------------------------------- |
| `neon` / `neon-strong` | `#4ade80` / `#6ef0a0` | 10% accent — buttons, active state, progress bar, hover glows |
| `dark-base`            | `#080808`             | 60% dominant background — page shell, sidebar                 |
| `surface`              | `#111111`             | 30% surface — cards, player bar, modals                       |
| `elevated`             | `#1a1a1a`             | 30% elevated surface — hover states, inputs                   |

**Why `dark-base` not `base`:** Tailwind has a built-in `text-base` font-size utility. Naming the color `base` causes `sm:text-base` to be interpreted as a color (`#080808`) instead of a font size. Always use `dark-base` for the background color token.

## 60/30/10 rule

- **60%** `dark-base` — page background, sidebar shell, large empty areas
- **30%** `surface` / `elevated` — cards, player bar, modals, hover states
- **10%** `neon` — primary buttons, play/pause, progress fill, active nav, focus rings, hover glows only

Neon should appear on at most 1–2 elements per viewport region at rest. More than that and the glow loses meaning.

## Glow shadows (tailwind.config.ts)

Kept intentionally subtle — avoid neon-everywhere syndrome:

- `shadow-neon-sm` — faint glow for active/playing elements
- `shadow-neon` — standard hover glow
- `shadow-neon-lg` — stronger glow for modals

## UI patterns

### Cards (SongItem, PlaylistCard)

- `rounded-xl border border-white/5 bg-surface shadow-[0_4px_12px_rgba(0,0,0,0.5)]` — dark bottom shadow for depth
- Gradient overlay on image: `from-neutral-900 via-neutral-900/20 to-transparent` — makes text readable
- On hover: `hover:bg-elevated hover:border-neon/20` — subtle surface lift, no default glow
- Play button appears on `group-hover` via opacity transition
- Action buttons (like, add to playlist) top-right with `bg-black/60` glass background

### Buttons

- Primary: `bg-neon text-black font-bold hover:bg-neon-strong` — black text on neon for contrast
- Secondary: `bg-elevated border border-neon/30 text-neon` — outlined neon
- Ghost: `text-neutral-300 hover:text-white` — no background

### Inputs

- `bg-elevated border border-white/10 focus:border-neon/50 focus:ring-1 focus:ring-neon/30`

### Header gradient

- `bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent border-b border-white/5 rounded-lg`
- The `to-transparent` fades into the page `bg-surface` — creates depth without a hard edge

### Active nav (SidebarItem)

- `text-neon [&>svg]:drop-shadow-[0_0_4px_rgba(74,222,128,0.3)]` — icon gets a faint glow

### Player bar

- `bg-surface border-t border-white/5` — sits on surface, hairline top border
- Progress fill: `bg-neon shadow-neon-sm` — glowing neon bar
- Play/pause: `bg-neon text-black` — same primary button pattern

## Scrollbar classes (app/globals.css)

- `.hide-scrollbar` — completely hides scrollbar (used on sidebar library)
- `.scrollbar` — neon-styled thin pill scrollbar (used on `<main>` in Sidebar.tsx)

The scrollbar lives on `<main>` in `Sidebar.tsx`. Inner page divs should not have their own `overflow-y-auto` — `<main>` is the single scroll container for all page content.

## Favicon

`app/favicon.png` is auto-detected by Next.js App Router. Do NOT add `icons: { icon: ... }` to metadata — it points to `public/` and overrides the correct file.

## Double-play bug fix (PlayerContent.tsx)

Root cause: `useSound` recreates the `sound` object on tab switch/re-render, causing the `useEffect` to fire again and call `sound.play()` a second time while the original is still playing.

Fix:

1. `hasAutoPlayedRef` — guards `sound.play()` so it only fires once per mount
2. `key={\`${song.id}-${songUrl}\`}`on`<PlayerContent>`in`Player.tsx` — forces a full remount (and old Howl unload) when the song changes

## Large MP3 playback

`useSound` is initialized with `html5: true`. Without it, large MP3s (>~10MB) fail with "Decoding audio data failed" because the browser tries to decode the entire file into Web Audio API memory instead of streaming it.

# UTM Visit Tracking

This project only **tracks visits** — it does not have its own analytics dashboard. The dashboard lives in `14_portfolio` (a separate project) and reads from the shared `utm_stats` table.

## What it does

On every page load, `UTMTracker` (a client component rendered in the root layout) fires once. It reads `window.location.search`, extracts any `utm_source`, `utm_medium`, and `utm_campaign` params, then calls `trackVisitAction` (a server action).

`trackVisitAction` behaviour:

- Skips anonymous users (no `userId` → returns early).
- Deduplicates: if the user already has a row in `utm_stats` for today, it skips the insert.
- If no UTM params are present it records the visit as `source=organic / medium=direct`.
- After tracking, `UTMTracker` strips the UTM params from the URL via `history.replaceState` so they don't pollute sharing or back-navigation.

## Files

| File                              | Role                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `app/features/UTM/UTMTracker.tsx` | Client component — reads URL params, calls the action, clears params from URL   |
| `app/actions/trackVisitAction.ts` | Server action — deduplicates, normalises params, inserts into `utm_stats`       |
| `app/features/UTM/utm-stats/`     | ADMIN-only route — exists for emergency/debug reads; **not the real dashboard** |

## The `/utm-stats` route

There is a local `/utm-stats` page protected by an ADMIN role check. It exists for debugging raw data from `utm_stats` directly in this app. It is **not** the main dashboard — the full analytics UI (charts, filters, campaigns) lives in `14_portfolio`. The dashboard component here uses mock data when the real table has no rows, and was generated by an AI assistant (marked `// Managed by Grok 4`).

## Database table

Table name: `utm_stats` (shared across projects, not prefixed with `19_`).

Columns used on insert: `user_id`, `source`, `medium`, `campaign`, `url`, `user_agent`.
