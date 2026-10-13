import { twMerge } from "tailwind-merge"

export default function LockedArtwork({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Paid track artwork"
      className={twMerge("flex items-center justify-center bg-black font-semibold text-neutral-500", className)}>
      ?
    </div>
  )
}
