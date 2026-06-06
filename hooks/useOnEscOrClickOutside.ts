"use client"

import { RefObject, useEffect } from "react"

const useOnEscOrClickOutside = (ref: RefObject<HTMLElement | null>, actionFn: () => void, condition?: boolean) => {
  const isCondition = typeof condition === "undefined" ? true : condition

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node) && isCondition) {
        actionFn()
      }
    }

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        actionFn()
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyPress)

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyPress)
    }
  }, [actionFn, isCondition, ref])
}

export default useOnEscOrClickOutside
