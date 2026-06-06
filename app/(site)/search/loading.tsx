"use client"
import { BounceLoader } from "react-spinners"

import Box from "@/components/Box"

export default function Loading() {
  return (
    <Box className="h-full flex justify-center items-center">
      <BounceLoader color="#22c55e" size={40} />
    </Box>
  )
}
