"use client"

import { useCallback, useEffect } from "react"
import { useAuthStore } from "@/hooks/useAuthStore"
import useDebounce from "@/hooks/useDebounce"
import { validateAuthEmail } from "@/app/utils/authValidation"
import Input from "@/components/Input"

export function InputEmail() {
  const { emailInputValue, setEmailInputValue, emailInputError, setEmailInputError } = useAuthStore()
  const debouncedEmail = useDebounce(emailInputValue, 1000)

  useEffect(() => {
    if (!debouncedEmail || !debouncedEmail.includes("@")) return
    const result = validateAuthEmail(debouncedEmail)
    setEmailInputError(typeof result === "string" ? result : "")
  }, [debouncedEmail, setEmailInputError])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmailInputValue(e.target.value)
      if (emailInputError) setEmailInputError("")
    },
    [emailInputError, setEmailInputValue, setEmailInputError],
  )

  return (
    <div>
      <Input
        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35"
        onChange={handleChange}
        placeholder="Email"
        type="email"
        value={emailInputValue}
      />
      {emailInputError && <p className="mt-1 px-1 text-xs text-rose-400">{emailInputError}</p>}
    </div>
  )
}
