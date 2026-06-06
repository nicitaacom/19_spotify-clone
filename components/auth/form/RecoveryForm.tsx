"use client"

import { useRouter } from "next/navigation"
import { useAuthStore } from "@/hooks/useAuthStore"
import { submitFormWithCredentialsFn } from "@/app/utils/submitFormWithCredentialsFn"
import { InputEmail } from "./InputEmail"
import { SubmitFormButton } from "./SubmitFormButton"
import { AuthFormProps } from "./types"

export function RecoveryForm({
  isActionBlocked,
  supabaseClient,
  isHumanGateEnabled,
  isVerified,
  token,
  onClose,
  syncCurrentUserFn,
  ensureHumanVerifiedFn,
  resetTurnstileFn,
}: AuthFormProps) {
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
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/60">
        We'll send a recovery email to this address.
      </div>
      <SubmitFormButton isActionBlocked={isActionBlocked} />
      <button
        className="block px-1 text-xs text-white/50 transition hover:text-white"
        onClick={() => {
          store.setAuthMessage("")
          store.setAuthStatus("error")
          store.setPasswordInputValue("")
          store.setPasswordInputError("")
          store.setAuthMode("login")
        }}
        type="button">
        Back to login
      </button>
    </form>
  )
}
