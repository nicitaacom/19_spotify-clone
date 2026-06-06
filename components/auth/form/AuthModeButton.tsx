"use client"

import { useAuthStore } from "@/hooks/useAuthStore"

export function AuthModeButton() {
  const { authMode, setAuthMode } = useAuthStore()

  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1">
      <button
        className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
          authMode === "login" ? "bg-white text-black" : "text-white/65 hover:text-white"
        }`}
        onClick={() => setAuthMode("login")}
        type="button">
        Log in
      </button>
      <button
        className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
          authMode === "register" ? "bg-white text-black" : "text-white/65 hover:text-white"
        }`}
        onClick={() => setAuthMode("register")}
        type="button">
        Register
      </button>
    </div>
  )
}
