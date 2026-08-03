"use client"

import { MouseEvent, useEffect, useState } from "react"
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai"
import { useRouter } from "next/navigation"
import { toast } from "react-hot-toast"
import { twMerge } from "tailwind-merge"

import { useUser } from "@/hooks/useUser"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import { handleAuthAction } from "@/app/utils/handleAuthAction"
import supabaseClient from "@/libs/supabaseClient"

interface LikeButtonProps {
  songId: string
  className?: string
  iconClassName?: string
  size?: number
  onToggle?: (isLiked: boolean) => void
}

const LikeButton: React.FC<LikeButtonProps> = ({ songId, className, iconClassName, size = 25, onToggle }) => {
  const router = useRouter()

  const { user } = useUser()
  const isIframe = useIsIframeAuth()

  const [isHovered, setIsHovered] = useState(false)

  const [isLiked, setIsLiked] = useState<boolean>(false)

  const [prevUserId, setPrevUserId] = useState(user?.id)
  if (user?.id !== prevUserId) {
    setPrevUserId(user?.id)
    if (!user?.id) setIsLiked(false)
  }

  useEffect(() => {
    if (!user?.id) return

    const fetchData = async () => {
      const { data, error } = await supabaseClient
        .from("19_liked_songs")
        .select("*")
        .eq("user_id", user.id)
        .eq("song_id", Number(songId))
        .maybeSingle()

      if (error) console.log("select liked song error in LikeButton - ", error.message)
      if (data) {
        setIsLiked(true)
      }
    }

    fetchData()
  }, [songId, user?.id])

  const Icon = isLiked ? AiFillHeart : AiOutlineHeart

  const handleLike = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (!user) {
      return handleAuthAction({ isIframe })
    }

    if (isLiked) {
      const { error } = await supabaseClient.from("19_liked_songs").delete().eq("user_id", user.id).eq("song_id", Number(songId))

      if (error) {
        toast.error(error.message)
      } else {
        setIsLiked(false)
        onToggle?.(false)
      }
    } else {
      const { error } = await supabaseClient.from("19_liked_songs").insert({
        song_id: Number(songId),
        user_id: user.id,
      })

      if (error) {
        toast.error(error.message)
      } else {
        setIsLiked(true)
        onToggle?.(true)
        toast.success("Success")
      }
    }

    router.refresh()
  }

  return (
    <button
      type="button"
      aria-label={isLiked ? "Unlike song" : "Like song"}
      className={twMerge(`cursor-pointer transition hover:opacity-100`, className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleLike}>
      <Icon className={iconClassName} color={isHovered ? "#ef4444" : isLiked ? "#22c55e" : "white"} size={size} />
    </button>
  )
}

export default LikeButton
