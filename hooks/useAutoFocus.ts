"use client"

import { useEffect, useRef } from "react"
import type { RefObject } from "react"

/**
 * Focus an element on mount (optionally after delayMs).
 *
 * Two shapes:
 * - `useAutoFocus<T>(delayMs?)` — the hook owns the ref, focuses once on mount. Attach the returned ref.
 * - `useAutoFocus(externalRef, isShown, delayMs?)` — the caller owns the ref; focuses each time `isShown`
 *   flips true (dropdown search inputs: focus the box every time the dropdown opens). `delayMs` matches
 *   the own-ref shape's — some callers need to wait a tick for an opening transition/mount to settle.
 *
 * `useAutoFocus(inputRef)`        // ❌ 1 arg = the "hook owns the ref" shape → expects a number (delayMs)
 * `useAutoFocus(inputRef, isOpen)` // ✅ external-ref shape needs the 2nd arg: WHEN to re-focus
 */
export function useAutoFocus<T extends HTMLElement>(delayMs?: number): RefObject<T | null>
export function useAutoFocus<T extends HTMLElement>(
  externalRef: RefObject<T | null>,
  isShown: boolean,
  delayMs?: number,
): RefObject<T | null>
export function useAutoFocus<T extends HTMLElement>(
  delayMsOrRef: number | RefObject<T | null> = 0,
  isShown?: boolean,
  externalDelayMs = 0,
) {
  const ownRef = useRef<T>(null)
  const isExternal = typeof delayMsOrRef === "object"
  const ref = isExternal ? delayMsOrRef : ownRef
  const delayMs = isExternal ? externalDelayMs : delayMsOrRef

  useEffect(() => {
    // External-ref shape: focus only while shown (open), skipping the closed state.
    if (isExternal && !isShown) return
    if (delayMs <= 0) {
      ref.current?.focus()
      return
    }
    const timer = setTimeout(() => ref.current?.focus(), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, isExternal, isShown, ref])

  return ref
}
