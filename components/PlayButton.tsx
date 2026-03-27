import { MouseEvent } from "react"
import { FaPlay } from "react-icons/fa"
import { twMerge } from "tailwind-merge"

interface PlayButtonProps {
  className?: string
  iconClassName?: string
  size?: number
  ariaLabel?: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

const PlayButton: React.FC<PlayButtonProps> = ({ className, iconClassName, size = 14, ariaLabel = "Play song", onClick }) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onClick?.(event)
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
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
      <FaPlay className={twMerge("translate-x-[1px]", iconClassName)} size={size} />
    </button>
  )
}

export default PlayButton
