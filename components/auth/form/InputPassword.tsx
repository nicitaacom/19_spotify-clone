"use client"

import { useCallback, useEffect, useState } from "react"
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai"
import { useAuthStore } from "@/hooks/useAuthStore"
import useDebounce from "@/hooks/useDebounce"
import { validatePasswordDetailed, PasswordValidationResult } from "@/app/utils/authValidation"

const strengthColors: Record<string, string> = {
  weak: "bg-rose-500",
  fair: "bg-amber-500",
  good: "bg-sky-500",
  strong: "bg-neon",
}

const strengthTextColors: Record<string, string> = {
  weak: "text-rose-400",
  fair: "text-amber-400",
  good: "text-sky-400",
  strong: "text-neon",
}

export function InputPassword() {
  const { passwordInputValue, setPasswordInputValue, passwordInputError, setPasswordInputError, authMode, isLoading } =
    useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState<PasswordValidationResult | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const debouncedPassword = useDebounce(passwordInputValue, 1000)

  useEffect(() => {
    if (authMode !== "register") return
    if (!debouncedPassword.trim()) {
      setPasswordStrength(null)
      setIsValidating(false)
      return
    }
    setIsValidating(true)
    const result = validatePasswordDetailed(debouncedPassword)
    setPasswordStrength(result)
    setIsValidating(false)
  }, [debouncedPassword, authMode])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPasswordInputValue(e.target.value)
      if (passwordInputError) setPasswordInputError("")
      if (authMode === "register" && e.target.value.trim()) setIsValidating(true)
    },
    [authMode, passwordInputError, setPasswordInputValue, setPasswordInputError],
  )

  const placeholder =
    authMode === "login" ? "Password" : authMode === "register" ? "Password (min 10 chars)" : "Password"

  return (
    <div>
      <div className="relative">
        <input
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder:text-white/35 focus:border-white/25 focus:outline-none disabled:opacity-50"
          disabled={isLoading}
          onChange={handleChange}
          placeholder={placeholder}
          type={showPassword ? "text" : "password"}
          value={passwordInputValue}
        />
        <button
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/70"
          onClick={() => setShowPassword(v => !v)}
          tabIndex={-1}
          type="button">
          {showPassword ? <AiOutlineEyeInvisible size={18} /> : <AiOutlineEye size={18} />}
        </button>
      </div>

      {passwordInputError && <p className="mt-1 px-1 text-xs text-rose-400">{passwordInputError}</p>}

      {authMode === "register" && passwordInputValue && (passwordStrength || isValidating) && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-white/40">Strength</span>
            {isValidating ? (
              <span className="text-xs text-white/35">Checking...</span>
            ) : (
              passwordStrength && (
                <span className={`text-xs font-medium capitalize ${strengthTextColors[passwordStrength.strength]}`}>
                  {passwordStrength.strength} ({passwordStrength.score}/100)
                </span>
              )
            )}
          </div>

          {passwordStrength && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strengthColors[passwordStrength.strength]}`}
                style={{ width: `${passwordStrength.score}%` }}
              />
            </div>
          )}

          {passwordStrength && passwordStrength.errors.length > 0 && (
            <ul className="space-y-0.5">
              {passwordStrength.errors.slice(0, 3).map((err, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-white/50">
                  <span className="mt-0.5 shrink-0 text-amber-400">•</span>
                  <span>{err}</span>
                </li>
              ))}
              {passwordStrength.errors.length > 3 && (
                <li className="pl-3 text-xs text-white/30">+{passwordStrength.errors.length - 3} more…</li>
              )}
            </ul>
          )}

          {passwordStrength && passwordStrength.strength === "strong" && passwordStrength.errors.length === 0 && (
            <p className="flex items-center gap-1.5 text-xs text-neon">
              <span>✓</span>
              <span>Strong password</span>
            </p>
          )}

          {isValidating && (
            <div className="flex items-center gap-1.5 text-xs text-white/35">
              <div className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-transparent" />
              <span>Checking security…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
