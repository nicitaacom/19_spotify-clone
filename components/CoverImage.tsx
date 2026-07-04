"use client"

import { useState } from "react"
import Image, { ImageProps } from "next/image"

const PLACEHOLDER_SRC = "/favicon.png"

interface CoverImageProps extends Omit<ImageProps, "src" | "onError"> {
  src: string | null
}

/**
 * Wraps next/image for song/playlist covers. A cover URL can point at a file that no longer
 * exists in Storage (see app/features/backup/dev_readme-backup.md's "Failed iterations" #7 — most
 * commonly a backup restore that skipped re-uploading an image) — this falls back to the
 * placeholder on load failure instead of rendering a broken-image icon.
 */
const CoverImage: React.FC<CoverImageProps> = ({ src, alt, ...imageProps }) => {
  const [hasError, setHasError] = useState(false)

  return (
    <Image
      {...imageProps}
      alt={alt}
      src={hasError || !src ? PLACEHOLDER_SRC : src}
      onError={() => setHasError(true)}
    />
  )
}

export default CoverImage
