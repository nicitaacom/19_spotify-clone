"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { twMerge } from "tailwind-merge"
import { RxCaretLeft, RxCaretRight } from "react-icons/rx"
import { HiHome } from "react-icons/hi"
import { BiSearch } from "react-icons/bi"
import { FaUserAlt } from "react-icons/fa"
import toast from "react-hot-toast"

import Button from "./Button"
import { useUser } from "@/hooks/useUser"
import usePlayer from "@/hooks/usePlayer"
import { getProductionAuthUrl, handleAuthAction, shouldUseExternalAuth } from "@/app/utils/handleAuthAction"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import useSearchModal from "@/hooks/useSearchModal"
import supabaseClient from "@/libs/supabaseClient"

interface HeaderProps {
  children: React.ReactNode
  className?: string
}

const Header: React.FC<HeaderProps> = ({ children, className }) => {
  const player = usePlayer()
  const router = useRouter()

  const { user } = useUser()
  const isIframe = useIsIframeAuth()
  const authUrl = getProductionAuthUrl()
  const shouldOpenExternalAuth = shouldUseExternalAuth({ isIframe })
  const searchModal = useSearchModal()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchModal.onOpen()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [searchModal])

  const handleLogout = async () => {
    const { error } = await supabaseClient.auth.signOut()
    player.reset()
    router.refresh()

    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Logged out!")
    }
  }

  return (
    <div className={twMerge(`h-fit bg-gradient-to-b from-[#0f1f14] via-[#0b0f0c] to-transparent border-b border-white/5 rounded-lg p-6 pr-8`, className)}>
      <div className="w-full mb-4 flex justify-between items-center">
        <div className="hidden md:flex gap-x-2 items-center">
          <button
            className="rounded-full bg-surface border border-white/10 flex justify-center items-center hover:border-neon/40 hover:shadow-neon-sm transition"
            onClick={() => router.back()}>
            <RxCaretLeft className="text-white" size={35} />
          </button>
          <button
            className="rounded-full bg-surface border border-white/10 flex justify-center items-center hover:border-neon/40 hover:shadow-neon-sm transition"
            onClick={() => router.forward()}>
            <RxCaretRight className="text-white" size={35} />
          </button>
        </div>
        <div className="flex md:hidden gap-x-2 items-center">
          <button className="rounded-full p-2 bg-surface border border-white/10 flex items-center justify-center hover:border-neon/40 hover:shadow-neon-sm transition">
            <HiHome className="text-white" size={20} />
          </button>
          <button
            className="rounded-full p-2 bg-surface border border-white/10 flex items-center justify-center hover:border-neon/40 hover:shadow-neon-sm transition"
            onClick={searchModal.onOpen}>
            <BiSearch className="text-white" size={20} />
          </button>
        </div>
        <div className="flex justify-between items-center gap-x-4">
          {user ? (
            <div className="flex gap-x-4 items-center">
              <Button onClick={handleLogout} className="bg-neon text-black hover:bg-neon-strong hover:shadow-neon hover:opacity-100">Logout</Button>
              <Button
                className="hidden md:inline-block bg-elevated border border-neon/30 text-neon hover:shadow-neon-sm hover:opacity-100"
                onClick={searchModal.onOpen}>
                <BiSearch />
              </Button>
              <Button className="bg-elevated border border-neon/30 text-neon hover:shadow-neon-sm hover:opacity-100" onClick={() => router.push("/account")}>
                <FaUserAlt />
              </Button>
            </div>
          ) : (
            <>
              <div>
                {shouldOpenExternalAuth && authUrl ? (
                  <Link
                    className="w-full rounded-full border border-transparent px-3 py-3 text-neutral-300 font-medium hover:text-white transition"
                    href={authUrl}
                    target="_blank"
                    rel="noreferrer">
                    Sign up
                  </Link>
                ) : (
                  <Button className="bg-transparent text-neutral-300 font-medium hover:text-white hover:bg-transparent hover:shadow-none" onClick={() => handleAuthAction({ isIframe })}>
                    Sign up
                  </Button>
                )}
              </div>
              <div>
                {shouldOpenExternalAuth && authUrl ? (
                  <Link
                    className="w-full rounded-full bg-neon border border-transparent px-6 py-2 text-black font-bold hover:bg-neon-strong transition"
                    href={authUrl}
                    target="_blank"
                    rel="noreferrer">
                    Log in
                  </Link>
                ) : (
                  <Button className="bg-neon text-black px-6 py-2 hover:bg-neon-strong hover:opacity-100" onClick={() => handleAuthAction({ isIframe })}>
                    Log in
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

export default Header
