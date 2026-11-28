import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useSpacebarPlayback } from "@/hooks/useSpacebarPlayback"
import { useWarnBeforeUnload } from "@/hooks/useWarnBeforeUnload"

afterEach(() => cleanup())

test("space toggles playback only when enabled and focus is outside text inputs", () => {
  const toggle = vi.fn()
  const { rerender, unmount } = renderHook(({ enabled }) => useSpacebarPlayback(enabled, toggle), { initialProps: { enabled: true } })
  const button = document.createElement("button")
  document.body.appendChild(button)
  button.focus()
  const space = new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true })
  window.dispatchEvent(space)
  expect(space.defaultPrevented).toBe(true)
  expect(toggle).toHaveBeenCalledTimes(1)
  expect(document.activeElement).not.toBe(button)

  const input = document.createElement("input")
  document.body.appendChild(input)
  input.focus()
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true }))
  expect(toggle).toHaveBeenCalledTimes(1)
  input.blur()
  rerender({ enabled: false })
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", cancelable: true }))
  expect(toggle).toHaveBeenCalledTimes(1)
  unmount()
  button.remove()
  input.remove()
})

test("beforeunload is blocked only while the operation is active", () => {
  const { rerender, unmount } = renderHook(({ active }) => useWarnBeforeUnload(active), { initialProps: { active: true } })
  const activeEvent = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(activeEvent)
  expect(activeEvent.defaultPrevented).toBe(true)
  rerender({ active: false })
  const inactiveEvent = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(inactiveEvent)
  expect(inactiveEvent.defaultPrevented).toBe(false)
  unmount()
})
