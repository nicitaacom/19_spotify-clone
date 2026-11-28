import { useEffect } from "react"

export function useSpacebarPlayback(enabled: boolean, toggle: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return
      const element = document.activeElement as HTMLElement | null
      const tag = element?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || element?.isContentEditable) return
      if (!enabled) return
      event.preventDefault()
      element?.blur()
      toggle()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled, toggle])
}
