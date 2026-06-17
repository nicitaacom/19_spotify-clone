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
          bg-neon
          p-4
          text-black
          transition
          hover:scale-105
          hover:bg-neon-strong
          hover:shadow-[0_0_10px_rgba(74,222,128,0.2)]
        `,
        className,
      )}>
      <Icon className={twMerge(!isPlaying && "translate-x-[1px]", iconClassName)} size={size} />
    </button>
  )
}

export default PlayButton
