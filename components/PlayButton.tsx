import { MouseEvent } from "react"
import { BsPauseFill } from "react-icons/bs"
import { FaPlay } from "react-icons/fa"
import { twMerge } from "tailwind-merge"

interface PlayButtonProps {
  className?: string
  iconClassName?: string
  size?: number
  ariaLabel?: string
  isPlaying?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

const PlayButton: React.FC<PlayButtonProps> = ({ className, iconClassName, size = 14, ariaLabel, isPlaying = false, onClick }) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onClick?.(event)
  }

  const Icon = isPlaying ? BsPauseFill : FaPlay
  const resolvedAriaLabel = ariaLabel ?? (isPlaying ? "Pause song" : "Play song")

  return (
    <button
      type="button"
      aria-label={resolvedAriaLabel}
      onClick={handleClick}
      className={twMerge(
        `
          flex
          items-center
          justify-center
          rounded-full
          bg-green-500
          p-4
          text-black
          shadow-lg
          shadow-black/30
          transition
          hover:scale-105
          hover:bg-green-400
        `,
        className,
      )}>
      <Icon className={twMerge(!isPlaying && "translate-x-[1px]", iconClassName)} size={size} />
    </button>
  )
}

export default PlayButton
