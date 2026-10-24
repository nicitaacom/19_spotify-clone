"use client"
import Box from "@/components/Box"
import { errorText } from "@/libs/errorText"

export default function Error({ error }: { error: Error & { digest?: string } }) {
  const detail = error.digest ? `${errorText(error)} Digest: ${error.digest}.` : errorText(error)
  return (
    <Box className="h-full justify-center items-center">
      <div className="text-neutral-400">{detail}</div>
    </Box>
  )
}
