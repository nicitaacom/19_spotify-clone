# Drag & Drop — dev notes

## How it works

Two layers cooperate:

1. **Drag detection** — a hook that listens on `document` for `dragenter`/`dragleave`/`drop`. Because it listens at the document level, it fires regardless of where the user drags (even outside the modal/component). `isDragging` becomes `true` the moment anything is dragged into the browser window.

2. **Drop target** — `ReactImageUploading` receives the actual file via its `dragProps` spread on a container. It handles validation (max size, type) and calls `onChange` with the picked `File`.

### Why document-level detection (not element-level)

CSS `pointer-events: none` blocks **drag events too** — `dragenter` will never fire on an element that has `pointer-events: none`. Since the overlay must be non-blocking when idle, element-level detection creates a chicken-and-egg problem: the overlay is invisible until dragging starts, but dragging can never be detected because the overlay is non-interactive.

Listening on `document` breaks the cycle: detection always works, the overlay only becomes interactive (`pointer-events-auto`) once `isDragging` is true.

```
dragenter on document  →  isDragging = true  →  overlay gets pointer-events-auto
drop / dragleave(window)  →  isDragging = false  →  overlay back to pointer-events-none
```

### `dragleave` edge case

`dragleave` fires for every child element the cursor moves over, not just when leaving the window. Using `event.relatedTarget === null` as the condition means we only reset `isDragging` when the drag genuinely exits the browser window — not on internal element transitions.

> This is the **document-level** form of the gotcha. The **per-element** form (when a scoped overlay tracks its own hover state) causes the hint to strobe — see [Per-zone hint flicker](#per-zone-hint-flicker-x200-loop) below.

---

## Directories

| Path                                                                             | What it is                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `app/(routes)/publish/hooks/useDragAndDropPost.ts`                               | Document-level drag hook for the publish flow                                             |
| `app/(routes)/publish/components/CreatePostModal/PostDragAndDropArea.tsx`        | Full-screen drop overlay component                                                        |
| `app/(routes)/support/[ticketOwnerId]/[ticketId]/components/DragAndDropArea.tsx` | Element-scoped drag overlay for the support ticket chat                                   |
| `app/hooks/useDrapAndDrop.ts`                                                    | Element-scoped drag hook used by the support ticket                                       |
| `app/components/Modals/FollowUpModal/components/FollowUpDragAndDropArea.tsx`     | Per-section drop zone (one per follow up) — multi-zone, with the drag-counter flicker fix |

---

## Implementing drag & drop on a specific area

Use this when you want drop to work only inside a bounded element (e.g. a chat input area).

**1. Use `useDragAndDropPost` with a ref** _(or copy `useDrapAndDrop` pattern from the support hook)_

```ts
const wrapperRef = useRef<HTMLDivElement | null>(null)
const { isDragging } = useDragAndDropPost() // document-level still recommended
```

**2. Render the overlay as `absolute` inside a `relative` container**

```tsx
// parent must have: className="relative"
<div className="relative">
  <YourContent />
  <DropOverlay /> {/* absolute inset-0 */}
</div>
```

**3. Spread `dragProps` from `ReactImageUploading` on the overlay div**

```tsx
<ReactImageUploading onChange={...} maxNumber={1} maxFileSize={4e6} onError={...}>
  {({ dragProps }) => (
    <div
      className={`absolute inset-0 z-20 ${isDragging ? "pointer-events-auto" : "pointer-events-none"}`}
      {...dragProps}>
      {isDragging && <div className="image-upload ...">Drop here</div>}
    </div>
  )}
</ReactImageUploading>
```

---

## Per-zone hint flicker (x200 loop)

**Only happens with multiple scoped zones** that each track their own hover state to show a "Drop image here" hint on the section the cursor is actually over (e.g. one zone per follow up, so the drop knows _which_ follow up to attach to). A single full-screen overlay never hits this.

### Symptom

Dragging over a zone makes the hint **strobe**: appears → disappears → appears … hundreds of times, then settles. Looks like a render loop.

### Cause

`dragenter` / `dragleave` fire in **pairs at every element boundary**, not just at the zone's outer edge. The instant the hint `<div>` mounts, the cursor is over it — and because the hint is a _child_ of the div holding the handlers, the browser fires `dragleave` on the parent ("you left, to enter a child"):

```
hint mounts → cursor now over hint (a child)
  → dragleave fires on parent → isHovered = false → hint UNMOUNTS
  → cursor now over parent again
  → dragenter fires on parent → isHovered = true → hint MOUNTS
  → … loop
```

It's the same children-fire-dragleave gotcha as the document-level case above, but here it toggles a _per-element_ hint instead of the global `isDragging`.

### Fix — drag counter + non-interactive hint

Two reinforcing parts. The counter is the real fix; `pointer-events-none` removes the boundary crossing at its source.

**1. Count enter/leave pairs** with a `useRef` (no re-render). The hint only hides when the count returns to `0` — i.e. the cursor genuinely left the whole zone. Child-boundary pairs net out:

```tsx
const dragCounter = useRef(0)
const resetHover = () => {
  dragCounter.current = 0
  setIsHovered(false)
}

<div
  {...dragProps}
  onDragEnter={e => {
    dragProps.onDragEnter(e)
    dragCounter.current++
    setIsHovered(true)
  }}
  onDragLeave={e => {
    dragProps.onDragLeave(e)
    dragCounter.current--
    if (dragCounter.current <= 0) resetHover()
  }}
  onDrop={e => {
    dragProps.onDrop(e)        // MUST call first — see "dropped image opens in a new tab" below
    resetHover()              // then zero the count so the next drag starts clean
  }}>
```

**2. Make the hint non-interactive** so it can never _be_ a drag target — then the cursor crossing onto it produces no enter/leave pair at all:

```tsx
{
  isDragging && isHovered && (
    <div className="image-upload pointer-events-none absolute inset-2 ...">Drop image here</div>
  )
}
```

> Same `dragCounter` pattern lives in `app/hooks/useDrapAndDrop.ts` (support chat) — reach for it whenever a scoped zone tracks its own hover/visibility, not just for follow ups.

Mental model: a turnstile counting people in and out of a room. Flip the lights off only when the count hits zero — not every time someone shuffles past the doorway.

---

## Dropped image opens in a new tab (instead of attaching)

### Symptom

Drag works, the hint shows, but the moment you **release** the mouse the browser navigates to the file — the image opens in a new tab and nothing attaches.

### Cause

The browser's **default** action for a file dropped anywhere is "open/navigate to that file." `ReactImageUploading`'s `dragProps.onDrop` is what calls `preventDefault()` and hands the file to `onChange`. If that handler never runs, the default wins.

The trap: when you wrap a `dragProps` handler to add your own logic, JSX props **do not merge** — the last `onX` wins. Spreading `{...dragProps}` and _then_ writing `onDrop={myFn}` on the same element **silently replaces** `dragProps.onDrop`:

```tsx
<div
  {...dragProps}              // puts dragProps.onDrop on the element…
  onDrop={resetHover}>        // …then THIS overwrites it. preventDefault never fires. ✗
```

### Fix — call `dragProps.onDrop(e)` first, then your logic

```tsx
onDrop={e => {
  dragProps.onDrop(e)   // preventDefault + hands file to the lib → onChange fires ✓
  resetHover()          // your cleanup runs after
}}
```

This is the same wrap-don't-replace rule already applied to `onDragEnter` / `onDragLeave` in the flicker fix — `onDrop` is the easy one to forget because it's the only handler whose _default browser behavior_ is destructive. The support chat does it the same way: `dragProps.onDrop(e), handleDrop()`.

> Rule of thumb: **every** `dragProps` handler you override must call `dragProps.onX(e)` as its first line. Spreading `{...dragProps}` is not enough once you add your own `onX` for the same event.

---

## Implementing drag & drop on the entire screen

Use this when you want the overlay to cover the full viewport regardless of where the user drops (UX for "rush mode" — user doesn't need to aim).

**1. Use `useDragAndDropPost`** — it already listens on `document`

**2. Render the overlay as `fixed inset-0` with a high z-index**

```tsx
<div className={`fixed inset-0 z-[9999] ${isDragging ? "pointer-events-auto" : "pointer-events-none"}`}>
  <ReactImageUploading onChange={...} maxNumber={1} maxFileSize={4e6} onError={...}>
    {({ dragProps }) => (
      <div className="w-full h-full" {...dragProps}>
        {isDragging && (
          <div className="image-upload absolute inset-8 rounded flex justify-center items-center ...">
            Drop image here
          </div>
        )}
      </div>
    )}
  </ReactImageUploading>
</div>
```

Mount this component anywhere — since it's `fixed`, it escapes all parent stacking contexts.

---

## Styling the drop zone — dashed border classes

Defined in `app/globals.css`. Use these on the visible drop hint `<div>`.

| Class           | Border color     | Use when             |
| --------------- | ---------------- | -------------------- |
| `.image-upload` | `#909090` (grey) | neutral / idle state |

```tsx
<div className="image-upload absolute inset-8 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center">
  Drop image here
</div>
```

To change the dashed border color, edit the `stroke` value in `globals.css`. The HEX must be URL-encoded: prefix with `%23` (e.g. `#1ce956` → `%231ce956`).

> Generator: https://kovart.github.io/dashed-border-generator/
> ✓ `stroke='%230E00FF'` ✗ `stroke='%0E00FF'` ✗ `stroke='0E00FF'`

---

## Checklist for a new drag-and-drop area

- [ ] `useDragAndDropPost` imported — detection always on document
- [ ] Overlay container: `fixed inset-0` (full screen) or `absolute inset-0` (scoped area, parent needs `relative`)
- [ ] `pointer-events-none` when idle, `pointer-events-auto` when `isDragging`
- [ ] `z-[9999]` for full-screen variant so it sits above modals/toasts
- [ ] `dragProps` from `ReactImageUploading` spread on the inner div
- [ ] Overriding any `dragProps` handler (`onDrop`/`onDragEnter`/`onDragLeave`)? call `dragProps.onX(e)` as the **first line** — spreading alone doesn't merge, and a missed `onDrop` opens the file in a new tab — see [Dropped image opens in a new tab](#dropped-image-opens-in-a-new-tab-instead-of-attaching)
- [ ] `onChange` calls `setIsDragging(false)` after file is picked
- [ ] **Multiple scoped zones with a per-zone hint?** use a `dragCounter` ref + `pointer-events-none` on the hint, or it strobes — see [Per-zone hint flicker](#per-zone-hint-flicker-x200-loop)
