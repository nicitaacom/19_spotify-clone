import { SupabaseClient } from "@supabase/supabase-js"
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import toast from "react-hot-toast"
import { validateAuthEmail, validateAuthPassword } from "./authValidation"
import { getURL } from "./getURL"

type AuthMode = "login" | "register" | "recover"
type AuthStatus = "error" | "info" | "success"

interface SubmitOpts {
  authMode: AuthMode
  emailInputValue: string
  passwordInputValue: string
  isHumanGateEnabled: boolean
  isVerified: boolean
  token: string | null
}

interface SubmitCallbacks {
  setAuthMessage: (msg: string) => void
  setAuthStatus: (s: AuthStatus) => void
  setAuthMode: (m: AuthMode) => void
  setPasswordInputError: (e: string) => void
  setEmailInputError: (e: string) => void
  setIsLoading: (b: boolean) => void
  resetTurnstileFn: () => void
  onClose: () => void
  syncCurrentUserFn: (provider: string) => Promise<true | string>
  ensureHumanVerifiedFn: () => Promise<true | string>
  router: AppRouterInstance
}

export async function submitFormWithCredentialsFn(
  event: React.FormEvent<HTMLFormElement>,
  supabaseClient: SupabaseClient,
  opts: SubmitOpts,
  callbacks: SubmitCallbacks,
): Promise<void> {
  event.preventDefault()

  const {
    authMode,
    emailInputValue,
    passwordInputValue,
  } = opts

  const {
    setAuthMessage,
    setAuthStatus,
    setAuthMode,
    setPasswordInputError,
    setEmailInputError,
    setIsLoading,
    resetTurnstileFn,
    onClose,
    syncCurrentUserFn,
    ensureHumanVerifiedFn,
    router,
  } = callbacks

  // Validate email
  const emailValidation = validateAuthEmail(emailInputValue)
  if (typeof emailValidation === "string") {
    setEmailInputError(emailValidation)
    setAuthStatus("error")
    setAuthMessage(emailValidation)
    return
  }

  // Validate password (skip for recover)
  if (authMode !== "recover") {
    const passwordValidation = validateAuthPassword(passwordInputValue, authMode as "login" | "register")
    if (typeof passwordValidation === "string") {
      setPasswordInputError(passwordValidation)
      setAuthStatus("error")
      setAuthMessage(passwordValidation)
      return
    }
  }

  try {
    setAuthMessage("")
    setEmailInputError("")
    setPasswordInputError("")

    const ensureHumanResp = await ensureHumanVerifiedFn()
    if (typeof ensureHumanResp === "string") {
      setAuthStatus("error")
      setAuthMessage(ensureHumanResp)
      return
    }

    setIsLoading(true)

    if (authMode === "recover") {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(emailInputValue.trim(), {
        redirectTo: getURL(),
      })

      if (error) {
        setAuthStatus("error")
        setAuthMessage(error.message)
        return
      }

      setAuthStatus("success")
      setAuthMessage("Recovery email sent. Use the email link from Supabase to continue resetting your password.")
      setAuthMode("login")
      resetTurnstileFn()
      return
    }

    if (authMode === "login") {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: emailInputValue.trim(),
        password: passwordInputValue,
      })

      if (error) {
        setAuthStatus("error")
        setAuthMessage(error.message)
        return
      }

      const syncUserResp = await syncCurrentUserFn("credentials")
      if (typeof syncUserResp === "string") {
        setAuthStatus("error")
        setAuthMessage(syncUserResp)
        resetTurnstileFn()
        return
      }

      router.refresh()
      resetTurnstileFn()
      onClose()
      return
    }

    // register
    const { data, error } = await supabaseClient.auth.signUp({
      email: emailInputValue.trim(),
      password: passwordInputValue,
      options: {
        data: {
          username: emailInputValue.trim().split("@")[0],
        },
        emailRedirectTo: getURL("/auth/callback/oauth?provider=credentials"),
      },
    })

    if (error) {
      setAuthStatus("error")
      setAuthMessage(error.message)
      return
    }

    // Supabase returns identities: [] when the email already exists (any provider)
    // — it never sends a confirmation email in this case (security: no email enumeration)
    if (data.user && data.user.identities?.length === 0) {
      setAuthStatus("error")
      setAuthMessage("An account with this email already exists. Try logging in, or use GitHub/Google if you signed up with those.")
      resetTurnstileFn()
      return
    }

    if (data.session) {
      const syncUserResp = await syncCurrentUserFn("credentials")
      if (typeof syncUserResp === "string") {
        setAuthStatus("error")
        setAuthMessage(syncUserResp)
        resetTurnstileFn()
        return
      }

      router.refresh()
      resetTurnstileFn()
      onClose()
      return
    }

    setAuthStatus("success")
    setAuthMessage("Check your email to confirm your account, then come back and log in.")
    setAuthMode("login")
    resetTurnstileFn()
  } catch (error) {
    setAuthStatus("error")
    const msg = error instanceof Error ? error.message : "Unable to continue with credentials."
    setAuthMessage(msg)
    toast.error(msg)
  } finally {
    setIsLoading(false)
  }
}
