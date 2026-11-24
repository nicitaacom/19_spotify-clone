# Drag and drop

## Current implementation

| Path | Responsibility |
| --- | --- |
| `app/(site)/slow-and-reverb/hooks/useDocumentDrag.ts` | File-drag detection, capture-phase navigation prevention, cancellation cleanup, and an optional file callback |
| `components/AddASongModal.tsx` → `SongScreenDrop` | Full-screen upload hint; routes dropped files to the song and cover inputs |
| `libs/droppedFileKind.ts` | Classifies song and cover files by name and MIME type, including empty desktop MIME types |
| `app/(site)/slow-and-reverb/components/FullScreenDropOverlay.tsx` | Interactive full-screen drop target shared by the audio editors |
| `app/(site)/slow-and-reverb/components/FileDropZone.tsx` | Bounded drop target and file picker shared by the audio editors |

This repository uses native drag events. The `ReactImageUploading`, publish, support-chat, and follow-up components from the earlier version of this guide belong to another project.

## Detection and browser navigation

`useDocumentDrag` listens at the window capture phase, before a child input, modal, or React event handler can stop the event from reaching document bubbling listeners.

Only file drags show the hint. During a protected drag, `dataTransfer.files` may still be empty, so detection also checks `dataTransfer.types` for `Files` and `dataTransfer.items` for file items. Text and link drags retain their normal behavior.

For file drags, both `dragover` and `drop` call `preventDefault()`. Canceling `dragover` makes the page a valid drop target. Canceling `drop` prevents the browser from opening the file or navigating away. Clearing `isDragging` by itself does not cancel navigation.

A drag-depth counter handles enter/leave pairs across child elements. Moving between fields must not flash the overlay. Repeated `dragover` events keep the hint active even if the browser missed the initial `dragenter`.

## Upload modal

The modal passes its file handler directly to the hook:

```tsx
const { isDragging } = useDocumentDrag(files => {
  if (!disabled) onFiles(files)
})
```

The hook reads the files synchronously during `drop`, clears the hint, and calls the current callback. A callback claims the drop with `stopPropagation()`, so an editor underneath an open upload modal does not also load that song. Other window capture listeners can still reset their own drag state.

`SongScreenDrop` renders its hint through a portal with `pointer-events-none`. It does not need to receive the drop itself: the capture listener owns delivery. There is no second document-bubbling drop listener.

`applyDroppedFiles` classifies the files, assigns them to the corresponding file inputs, and invokes the existing song/image change handlers. A combined drop can fill both inputs. Metadata extraction and cover previews use the same path as file-picker selection.

While the form is busy or a confirmation is open, the callback ignores new files. The hook still cancels file navigation, and the hint stays hidden.

## Cancellation and stale hints

A drop, `dragend`, leaving the window, Escape, window blur/focus, pointer activity, page hiding, or tab hiding clears the drag state. Escape during an active drag is consumed before the modal handles it as a close request.

An inactivity timer also clears the hint after 1.5 seconds without a file drag event. This covers external file-manager drags that end without sending the page `drop`, `dragleave`, or `dragend`. Normal `dragover` events renew the timer while a drag continues. File-picker focus changes and regular pointer movement clear stale hints immediately.

Unmounting removes the capture listeners and pending timer. The callback is kept current after each render rather than captured from the first render.

## Shared editor overlays

Editors call `useDocumentDrag()` without a callback and pass `isDragging` to `FullScreenDropOverlay`. The hook prevents file navigation immediately, then defers its state reset to the next task so the overlay remains mounted while React's `onDrop` receives the file. The overlay invokes the editor's `onFile` once. Resetting during capture can unmount the React target before its handler runs.

```tsx
const { isDragging } = useDocumentDrag()

return <FullScreenDropOverlay isDragging={isDragging} onFile={loadFile} />
```

For a bounded drop zone, keep the existing `FileDropZone` enter/leave counter and reset it on drop. A decorative hint should use `pointer-events-none` so mounting it does not create extra target-boundary transitions.

When wrapping an existing drop handler, call that handler as well as your cleanup. JSX event props replace one another; they do not merge. Losing the handler that calls `preventDefault()` allows browser navigation.

## Verification

Run the drag lifecycle and file-routing regressions:

```sh
node --experimental-strip-types --test tests/documentDrag.test.mjs libs/droppedFileKind.test.mjs
```

Browser checks should use native file drag/drop events and verify:

- Idle pages and text/link drags show no file hint.
- A continuing file drag keeps the hint visible across field boundaries.
- Dropping an audio file fills the song input without opening a tab, including over a child that stops bubbling.
- Dropping a song and cover together fills both inputs.
- Canceling, opening/closing a file picker, or losing the final drag event cannot leave the overlay stuck.
- Busy forms ignore file changes while still preventing navigation.
- Shared editor overlays receive the file once; an open upload modal claims its own drops.
