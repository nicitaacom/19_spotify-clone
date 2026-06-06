"use client"

import { SupabaseClient } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/hooks/useAuthStore"
import { submitFormWithCredentialsFn } from "@/app/utils/submitFormWithCredentialsFn"
import { InputEmail } from "./InputEmail"
import { InputPassword } from "./InputPassword"
import { SubmitFormButton } from "./SubmitFormButton"

interface LoginFormProps {
  isActionBlocked: boolean
  supabaseClient: SupabaseClient
  isHumanGateEnabled: boolean
  isVerified: boolean
  token: string | null
  onClose: () => void
  syncCurrentUserFn: (provider: string) => Promise<true | string>
  ensureHumanVerifiedFn: () => Promise<true | string>
  resetTurnstileFn: () => void
}

export function LoginForm({
  isActionBlocked,
  supabaseClient,
  isHumanGateEnabled,
  isVerified,
  token,
  onClose,
  syncCurrentUserFn,
  ensureHumanVerifiedFn,
  resetTurnstileFn,
}: LoginFormProps) {
  const router = useRouter()
  const store = useAuthStore()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    submitFormWithCredentialsFn(
      e,
      supabaseClient,
      {
        authMode: store.authMode,
        emailInputValue: store.emailInputValue,
        passwordInputValue: store.passwordInputValue,
        isHumanGateEnabled,
        isVerified,
        token,
      },
      {
        setAuthMessage: store.setAuthMessage,
        setAuthStatus: store.setAuthStatus,
        setAuthMode: store.setAuthMode,
        setPasswordInputError: store.setPasswordInputError,
        setEmailInputError: store.setEmailInputError,
        setIsLoading: store.setIsLoading,
        resetTurnstileFn,
        onClose,
        syncCurrentUserFn,
        ensureHumanVerifiedFn,
        router,
      },
    )
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <InputEmail />
      <InputPassword />
      <button
        className="block px-1 text-xs text-white/50 transition hover:text-white"
        onClick={() => {
          store.setAuthMessage("")
          store.setAuthStatus("info")
          store.setPasswordInputValue("")
          store.setPasswordInputError("")
          store.setAuthMode("recover")
        }}
        type="button">
        Recover password
      </button>
      <SubmitFormButton isActionBlocked={isActionBlocked} />
    </form>
  )
}
