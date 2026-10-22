export const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const imageFileError = (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (IMAGE_MIME_BY_EXTENSION[extension] !== file.type.toLowerCase() || file.size > MAX_IMAGE_BYTES) {
    return "Choose a JPG, JPEG, PNG, WebP, or AVIF image smaller than 10 MB."
  }
  return ""
}
