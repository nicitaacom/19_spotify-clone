import { useEffect, useRef } from "react"

type ModifierKey = "ctrl" | "meta" | "alt" | "shift"

type TUseHotkeyOptions = {
  hotkey?: string
  sequence?: string[]
  modifiers?: ModifierKey[]
  onKeyPressFn: () => void
  ignoreInputs?: boolean
  ignoreButtons?: boolean
  isEnabled?: boolean
}

const ALWAYS_SKIP_IN_INPUTS = new Set(["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])

const NUMPAD_CODE_MAP: Record<string, string> = {
  Numpad0: "0",
  Numpad1: "1",
  Numpad2: "2",
  Numpad3: "3",
  Numpad4: "4",
  Numpad5: "5",
  Numpad6: "6",
  Numpad7: "7",
  Numpad8: "8",
  Numpad9: "9",
  NumpadAdd: "+",
  NumpadMultiply: "*",
  NumpadDecimal: ".",
  NumpadEnter: "Enter",
  NumpadSubtract: "-",
  NumpadDivide: "/",
}

const ENGLISH_KEY_BY_CODE: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
}

function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const numpadKey = NUMPAD_CODE_MAP[event.code]
  if (numpadKey) return numpadKey === hotkey

  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase() === hotkey

  if (!event.shiftKey && /^Digit[0-9]$/.test(event.code) && event.code.slice(5) === hotkey) return true
  if (!event.shiftKey && ENGLISH_KEY_BY_CODE[event.code] === hotkey) return true

  const typedKey = event.key.length === 1 && event.key >= "A" && event.key <= "Z" ? event.key.toLowerCase() : event.key
  return typedKey === hotkey
}

export const useHotkey = ({
  hotkey,
  sequence,
  modifiers = [],
  onKeyPressFn,
  ignoreInputs = false,
  ignoreButtons = false,
  isEnabled = true,
}: TUseHotkeyOptions) => {
  const sequenceIndexRef = useRef(0)
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onKeyPressFnRef = useRef(onKeyPressFn)

  useEffect(() => {
    onKeyPressFnRef.current = onKeyPressFn
  })

  useEffect(() => {
    if (!isEnabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null
      const activeTag = (activeEl?.tagName || "").toUpperCase()
      const isEditableContext = ["INPUT", "TEXTAREA", "SELECT"].includes(activeTag) || activeEl?.isContentEditable

      const isSlider = activeEl?.getAttribute("role") === "slider"
      if ((isEditableContext || isSlider) && ALWAYS_SKIP_IN_INPUTS.has(event.key)) return
      if (ignoreInputs && isEditableContext) return
      if (ignoreButtons && activeTag === "BUTTON") return

      if (sequence && sequence.length > 0) {
        const expected = sequence[sequenceIndexRef.current]
        if (expected && matchesHotkey(event, expected)) {
          event.preventDefault()
          sequenceIndexRef.current += 1

          if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current)
          sequenceTimerRef.current = setTimeout(() => {
            sequenceIndexRef.current = 0
          }, 500)

          if (sequenceIndexRef.current === sequence.length) {
            sequenceIndexRef.current = 0
            if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current)
            onKeyPressFnRef.current()
          }
        } else {
          sequenceIndexRef.current = 0
          if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current)
        }
        return
      }

      if (!hotkey) return
      const modCheck = { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey }
      const allModifiersMatch = modifiers.every(modifier => modCheck[modifier])
      const extraModifierActive = Object.entries(modCheck).some(
        ([modifier, isActive]) => !modifiers.includes(modifier as ModifierKey) && isActive,
      )
      if (!allModifiersMatch || extraModifierActive) return

      if (matchesHotkey(event, hotkey)) {
        event.preventDefault()
        onKeyPressFnRef.current()
      }
    }

    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true)
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current)
    }
  }, [hotkey, sequence, modifiers, ignoreInputs, ignoreButtons, isEnabled])
}
