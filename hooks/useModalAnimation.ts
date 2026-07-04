import { useEffect, useState } from "react"

// Keeps a modal mounted for `animationDuration` ms after `isOpen` flips to false, so its exit
// animation can play before it unmounts. Return value drives whether the modal is rendered.
export function useModalAnimation(isOpen: boolean, animationDuration: number = 250) {
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      return
    }
    if (!shouldRender) return
    const timer = setTimeout(() => setShouldRender(false), animationDuration)
    return () => clearTimeout(timer)
  }, [isOpen, shouldRender, animationDuration])

  return shouldRender
}
