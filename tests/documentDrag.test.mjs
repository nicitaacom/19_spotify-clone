import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const source = await readFile(new URL("../app/(site)/slow-and-reverb/hooks/useDocumentDrag.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function mount(t, onFiles) {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const window = new EventTarget()
  const document = new EventTarget()
  document.hidden = false
  document.documentElement = {}
  const timers = new Map()
  let timerId = 0
  window.setTimeout = callback => { timers.set(++timerId, callback); return timerId }
  window.clearTimeout = id => timers.delete(id)
  globalThis.window = window
  globalThis.document = document
  let dragging = false
  const effects = []
  const compiledModule = { exports: {} }
  const react = {
    useState: () => [false, next => { dragging = next }],
    useRef: value => ({ current: value }),
    useEffect: setup => effects.push(setup),
  }
  const executeModule = new Function("require", "module", "exports", compiled)
  executeModule(name => {
    assert.equal(name, "react")
    return react
  }, compiledModule, compiledModule.exports)
  compiledModule.exports.useDocumentDrag(onFiles)
  const cleanups = effects.map(setup => setup()).filter(Boolean)
  const cleanup = () => cleanups.splice(0).forEach(dispose => dispose())
  t.after(() => {
    cleanup()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  })
  function dispatch(type, properties = {}, target = window) {
    const event = new Event(type, { cancelable: true })
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value })
    target.dispatchEvent(event)
    return event
  }
  const fileTransfer = files => ({ types: ["Files"], items: [{ kind: "file" }], files: files ?? [], dropEffect: "none" })
  const drag = (type, properties = {}) => dispatch(type, { dataTransfer: fileTransfer(), ...properties })
  return {
    drag, dispatch, fileTransfer, document, cleanup,
    isDragging: () => dragging,
    expire: () => { for (const callback of Array.from(timers.values())) callback() },
    pendingTimers: () => timers.size,
  }
}

test("text and link drags keep their browser behavior and never show the file overlay", t => {
  const state = mount(t)
  for (const type of ["dragenter", "dragover", "drop"]) {
    const event = state.dispatch(type, { dataTransfer: { types: ["text/plain", "text/uri-list"], items: [{ kind: "string" }], files: [] } })
    assert.equal(event.defaultPrevented, false)
    assert.equal(state.isDragging(), false)
  }
})

test("a protected file drag shows the overlay even before files are readable", t => {
  const state = mount(t)
  assert.equal(state.drag("dragenter").defaultPrevented, true)
  assert.equal(state.isDragging(), true)
  const transfer = state.fileTransfer()
  assert.equal(state.drag("dragover", { dataTransfer: transfer }).defaultPrevented, true)
  assert.equal(transfer.dropEffect, "copy")
})

test("crossing child elements keeps the overlay until the entire drag leaves", t => {
  const state = mount(t)
  state.drag("dragenter")
  state.drag("dragenter")
  state.drag("dragleave", { relatedTarget: null })
  assert.equal(state.isDragging(), true)
  state.drag("dragleave", { relatedTarget: null })
  assert.equal(state.isDragging(), false)
  assert.equal(state.pendingTimers(), 0)
})

test("file drops cancel navigation, deliver the actual files once, and clear the overlay", t => {
  const drops = []
  const state = mount(t, files => drops.push(files))
  const song = new File(["audio"], "recording.mp3", { type: "audio/mpeg" })
  const image = new File(["cover"], "cover.png", { type: "image/png" })
  state.drag("dragenter")
  const event = state.drag("drop", { dataTransfer: state.fileTransfer([song, image]) })
  assert.equal(event.defaultPrevented, true)
  assert.deepEqual(drops, [[song, image]])
  assert.equal(state.isDragging(), false)
  assert.equal(state.pendingTimers(), 0)
})

test("a hook without a file callback still prevents file navigation and allows scoped drop handlers", t => {
  const state = mount(t)
  const song = new File(["audio"], "recording.mp3")
  state.drag("dragenter")
  const event = state.drag("drop", { dataTransfer: state.fileTransfer([song]) })
  assert.equal(event.defaultPrevented, true)
  assert.equal(state.isDragging(), true, "the scoped drop target must stay mounted while drop propagates")
  state.expire()
  assert.equal(state.isDragging(), false)
})

for (const event of ["dragend", "blur", "focus", "pointerdown", "pointermove", "pagehide"]) {
  test(`${event} clears a canceled drag without waiting for a drop`, t => {
    const state = mount(t)
    state.drag("dragenter")
    state.dispatch(event)
    assert.equal(state.isDragging(), false)
    assert.equal(state.pendingTimers(), 0)
  })
}

test("Escape cancels the drag before the modal treats it as a request to close", t => {
  const state = mount(t)
  state.drag("dragenter")
  assert.equal(state.dispatch("keydown", { key: "Escape" }).defaultPrevented, true)
  assert.equal(state.isDragging(), false)
  assert.equal(state.dispatch("keydown", { key: "Escape" }).defaultPrevented, false)
})

test("hiding the tab clears a drag", t => {
  const state = mount(t)
  state.drag("dragenter")
  state.document.hidden = true
  state.dispatch("visibilitychange", {}, state.document)
  assert.equal(state.isDragging(), false)
})

test("lost drag events expire and the next real drag still works", t => {
  const state = mount(t)
  state.drag("dragenter")
  state.expire()
  assert.equal(state.isDragging(), false)
  state.drag("dragover")
  assert.equal(state.isDragging(), true)
  state.drag("drop")
  state.expire()
  assert.equal(state.isDragging(), false)
})

test("unmount removes the event handlers and pending stale-drag reset", t => {
  const drops = []
  const state = mount(t, files => drops.push(files))
  state.drag("dragenter")
  state.cleanup()
  assert.equal(state.pendingTimers(), 0)
  const song = new File(["audio"], "recording.mp3")
  const event = state.drag("drop", { dataTransfer: state.fileTransfer([song]) })
  assert.equal(event.defaultPrevented, false)
  assert.deepEqual(drops, [])
})
