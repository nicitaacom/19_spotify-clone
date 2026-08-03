import { useEffect, useState } from "react"

// Keeps a modal mounted for `animationDuration` ms after `isOpen` flips to false, so its exit
// animation can play before it unmounts. Return value drives whether the modal is rendered.
export function useModalAnimation(isOpen: boolean, animationDuration: number = 250) {
  const [isClosing, setIsClosing] = useState(false)

  // Starts the exit-animation window the instant `isOpen` flips to false - done during render, not
  // an effect, so the modal never disappears for a frame before the timer below picks it up.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (!isOpen) setIsClosing(true)
  }

  useEffect(() => {
    if (!isClosing) return
    const timer = setTimeout(() => setIsClosing(false), animationDuration)
    return () => clearTimeout(timer)
  }, [isClosing, animationDuration])

  return isOpen || isClosing
}
