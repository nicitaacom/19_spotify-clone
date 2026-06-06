"use client"

import { HiOutlineArrowRight } from "react-icons/hi2"
import { useAuthStore } from "@/hooks/useAuthStore"
import Button from "@/components/Button"

interface SubmitFormButtonProps {
  isActionBlocked: boolean
}

export function SubmitFormButton({ isActionBlocked }: SubmitFormButtonProps) {
  const { authMode, isLoading } = useAuthStore()

  const label =
    authMode === "login"
      ? "Continue with credentials"
      : authMode === "register"
        ? "Register with credentials"
        : "Send recovery email"

  return (
    <Button
      className="rounded-2xl border border-emerald-400/15 bg-emerald-500 px-4 py-3 text-sm font-semibold text-black"
      disabled={isActionBlocked}
      type="submit">
      <span className="flex items-center justify-center gap-2">
        <span>{isLoading ? "Please wait..." : label}</span>
        <HiOutlineArrowRight size={16} />
      </span>
    </Button>
  )
}
