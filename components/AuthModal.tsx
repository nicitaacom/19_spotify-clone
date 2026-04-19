"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useSessionContext, useSupabaseClient } from "@supabase/auth-helpers-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import { FaGithub } from "react-icons/fa"
import { HiOutlineArrowRight } from "react-icons/hi2"
import { MdOutlineErrorOutline } from "react-icons/md"

import useAuthModal from "@/hooks/useAuthModal"
import { useVerifyHuman } from "@/hooks/useVerifyHuman"
import { verifyTurnstileTokenFn } from "@/app/utils/verifyTurnstileToken"

import Modal from "./Modal"
import Button from "./Button"
import Input from "./Input"
import TurnstileChallenge from "./TurnstileChallenge"
import { getURL } from "@/app/utils/getURL"
import { OrganicCanvasBackground } from "./auth/OrganicCanvasBackground"
import { AuthVisualPanel } from "./auth/AuthVisualPanel"
import { validateAuthEmail, validateAuthPassword } from "@/app/utils/authValidation"

type AuthMode = "login" | "recover" | "register"
type AuthStatus = "error" | "info" | "success"

const statusStyles: Record<AuthStatus, string> = {
  error: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  info: "border-sky-400/20 bg-sky-400/10 text-sky-100",
  success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
}

const AuthModal = () => {
  const { session } = useSessionContext()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { onClose, onOpen, isOpen } = useAuthModal()
  const supabaseClient = useSupabaseClient()
  const [authMode, setAuthMode] = useState<AuthMode>("login")
  const [authMessage, setAuthMessage] = useState("")
  const [authStatus, setAuthStatus] = useState<AuthStatus>("error")
  const [emailInputValue, setEmailInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [passwordInputValue, setPasswordInputValue] = useState("")
  const turnstileRef = useRef<HTMLDivElement>(null)
  const { isVerified, token, resetTurnstileFn, shouldRenderChallenge } = useVerifyHuman(turnstileRef, {
    isEnabled: isOpen,
  })
  const isHumanGateEnabled = Boolean(process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY)
  const isActionBlocked = isLoading || (isHumanGateEnabled && !isVerified)

  const resetAuthStateFn = useCallback(() => {
    setAuthMode("login")
    setAuthMessage("")
    setAuthStatus("error")
    setEmailInputValue("")
    setIsLoading(false)
    setPasswordInputValue("")
    resetTurnstileFn()
  }, [resetTurnstileFn])

  useEffect(() => {
    if (!session) {
      return
    }

    resetAuthStateFn()
    router.refresh()
    onClose()
  }, [onClose, resetAuthStateFn, router, session])

  useEffect(() => {
    const authError = searchParams.get("auth_error")
    if (!authError) {
      return
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString())
    nextSearchParams.delete("auth_error")

    setAuthStatus("error")
    setAuthMessage(authError)
    toast.error(authError)
    onOpen()
    router.replace(nextSearchParams.toString() ? `${pathname}?${nextSearchParams.toString()}` : pathname)
  }, [onOpen, pathname, router, searchParams])

  const onChange = (open: boolean) => {
    if (!open) {
      resetAuthStateFn()
      onClose()
    }
  }

  const ensureHumanVerifiedFn = async () => {
    const isDev = process.env.NODE_ENV !== "production"
    if (!isHumanGateEnabled || isDev) {
      return true
    }

    if (!isVerified || !token) {
      return "Complete the Cloudflare challenge before continuing."
    }

    const verifyTurnstileResp = await verifyTurnstileTokenFn(token)

    if (typeof verifyTurnstileResp === "string") {
      resetTurnstileFn()
      return verifyTurnstileResp
    }

    return true
  }

  const syncCurrentUserFn = async (provider: string) => {
    const response = await fetch("/api/auth/sync-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider }),
    })

    if (!response.ok) {
      const responseBody = (await response.json().catch(() => ({}))) as { error?: string }
      return responseBody.error ?? "Unable to sync your account."
    }

    return true
  }

  const continueWithGithubFn = async () => {
    try {
      setAuthMessage("")
      setAuthStatus("error")

      const ensureHumanResp = await ensureHumanVerifiedFn()
      if (typeof ensureHumanResp === "string") {
        setAuthStatus("error")
        setAuthMessage(ensureHumanResp)
        toast.error(ensureHumanResp)
        return
      }

      setIsLoading(true)

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: getURL("/auth/callback/oauth?provider=github"),
        },
      })

      if (error) {
        setAuthStatus("error")
        setAuthMessage(error.message)
        toast.error(error.message)
        setIsLoading(false)
      }
    } catch (error) {
      setIsLoading(false)
      const errorMessage = error instanceof Error ? error.message : "Unable to start GitHub login."
      setAuthMessage(errorMessage)
      toast.error(errorMessage)
    }
  }

  const handleCredentialsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const emailValidation = validateAuthEmail(emailInputValue)
    if (typeof emailValidation === "string") {
      setAuthStatus("error")
      setAuthMessage(emailValidation)
      return
    }

    if (authMode !== "recover") {
      const passwordValidation = validateAuthPassword(passwordInputValue, authMode)
      if (typeof passwordValidation === "string") {
        setAuthStatus("error")
        setAuthMessage(passwordValidation)
        return
      }
    }

    try {
      setAuthMessage("")

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
        setPasswordInputValue("")
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
      setPasswordInputValue("")
      resetTurnstileFn()
    } catch (error) {
      setAuthStatus("error")
      setAuthMessage(error instanceof Error ? error.message : "Unable to continue with credentials.")
    } finally {
      setIsLoading(false)
    }
  }

  const authTitle =
    authMode === "login" ? "Log in to your account" : authMode === "register" ? "Create your account" : "Recover your password"
  const submitLabel =
    authMode === "login"
      ? "Continue with credentials"
      : authMode === "register"
        ? "Register with credentials"
        : "Send recovery email"

  return (
    <Modal
      contentClassName="h-[calc(100%-32px)] max-h-[calc(100%-32px)] w-[calc(100%-32px)] border-white/10 bg-transparent p-0 md:h-auto md:max-h-[92vh] md:max-w-[960px]"
      hideHeader
      isOpen={isOpen}
      onChange={onChange}
      title="Account authentication"
      description="Log in with GitHub or credentials to access your Spotify clone account.">
      <OrganicCanvasBackground className="rounded-[28px]">
        <div className="grid md:grid-cols-[1.08fr_0.92fr]">
          <AuthVisualPanel />

          <div className="relative flex flex-col justify-center p-5 md:p-8">
            <div className="space-y-6 rounded-[24px] border border-white/10 bg-black/25 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-7">
              <div className="space-y-3">
                <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
                  Spotify Clone Auth
                </div>
                <div>
                  <h1 className="text-3xl font-semibold leading-tight text-white">{authTitle}</h1>
                  <p className="mt-2 text-sm leading-6 text-white/70">
                    This modal now follows the same auth direction as your `ai-chatbot-saas`: credentials for everyone,
                    GitHub as an extra option, and app-level user row sync for `users_19_spotify`.
                  </p>
                </div>
              </div>

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

              {authMessage && (
                <div className={`rounded-2xl border p-4 text-sm ${statusStyles[authStatus]}`}>
                  <div className="flex items-start gap-3">
                    <MdOutlineErrorOutline className="mt-0.5 shrink-0" size={18} />
                    <p className="leading-6">{authMessage}</p>
                  </div>
                </div>
              )}

              {shouldRenderChallenge && (
                <TurnstileChallenge isVerified={isVerified} onDismiss={() => onChange(false)} turnstileRef={turnstileRef} />
              )}

              <div className="space-y-3">
                <form className="space-y-3" onSubmit={handleCredentialsSubmit}>
                  <Input
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35"
                    disabled={isLoading}
                    onChange={event => setEmailInputValue(event.target.value)}
                    placeholder="Email"
                    type="email"
                    value={emailInputValue}
                  />

                  {authMode === "recover" ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/60">
                      We’ll send a Supabase recovery email to this address after the Cloudflare check is completed.
                    </div>
                  ) : (
                    <Input
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35"
                      disabled={isLoading}
                      onChange={event => setPasswordInputValue(event.target.value)}
                      placeholder={authMode === "login" ? "Password" : "Password (min 15 chars)"}
                      type="password"
                      value={passwordInputValue}
                    />
                  )}

                  <Button
                    className="rounded-2xl border border-emerald-400/15 bg-emerald-500 px-4 py-3 text-sm font-semibold text-black"
                    disabled={isActionBlocked}
                    type="submit">
                    <span className="flex items-center justify-center gap-2">
                      <span>{isLoading ? "Please wait..." : submitLabel}</span>
                      <HiOutlineArrowRight size={16} />
                    </span>
                  </Button>
                </form>

                <div className="flex items-center justify-between gap-3 px-1 text-xs text-white/50">
                  <button
                    className="transition hover:text-white"
                    onClick={() => {
                      setAuthMessage("")
                      setAuthStatus("info")
                      setPasswordInputValue("")
                      setAuthMode(authMode === "recover" ? "login" : "recover")
                    }}
                    type="button">
                    {authMode === "recover" ? "Back to login" : "Recover password"}
                  </button>
                  {isHumanGateEnabled && !isVerified ? <span>Cloudflare check required</span> : null}
                </div>

                {authMode !== "recover" ? (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs uppercase tracking-[0.2em] text-white/35">or</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <Button
                      className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black"
                      disabled={isActionBlocked}
                      onClick={continueWithGithubFn}>
                      <span className="flex items-center justify-center gap-3">
                        <FaGithub size={18} />
                        <span>{isLoading ? "Redirecting to GitHub..." : "Continue with GitHub"}</span>
                      </span>
                    </Button>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/60">
                      Credentials login uses Supabase email/password under this app’s existing session system, then syncs
                      the same `users_19_spotify` row shape used by GitHub auth.
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </OrganicCanvasBackground>
    </Modal>
  )
}

export default AuthModal
