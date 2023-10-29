'use client'
import { useEffect, useState } from "react"

import AuthModal from "../components/AuthModal"

export default function ModalProvider () {

  const [isMounted,setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  },[])

  if (!isMounted) {
    return null
  }

return (
    <>
     <AuthModal/>
    </>
)
}