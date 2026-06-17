import React from "react"

import { twMerge } from "tailwind-merge"

interface BoxProps {
  children: React.ReactNode
  className?: string
}

export default function Box({ children, className }: BoxProps) {
  return <div className={twMerge(`bg-surface rounded-lg h-fit w-full border border-white/5`, className)}>{children}</div>
}
