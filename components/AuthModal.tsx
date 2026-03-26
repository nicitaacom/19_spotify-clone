"use client"

import React, { useEffect, useState } from "react"
import { useSessionContext, useSupabaseClient } from "@supabase/auth-helpers-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import { FaGithub } from "react-icons/fa"
import { HiOutlineArrowRight } from "react-icons/hi2"
import { MdOutlineErrorOutline } from "react-icons/md"

import useAuthModal from "@/hooks/useAuthModal"

import Modal from "./Modal"
import Button from "./Button"
import Input from "./Input"
import { getURL } from "@/app/utils/getURL"
import { OrganicCanvasBackground } from "./auth/OrganicCanvasBackground"
import { AuthVisualPanel } from "./auth/AuthVisualPanel"
import { validateAuthEmail, validateAuthPassword } from "@/app/utils/authValidation"

type AuthMode = "login" | "register"
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

  useEffect(() => {
    if (session) {
      setAuthMode("login")
      setAuthMessage("")
      setIsLoading(false)
      setEmailInputValue("")
      setPasswordInputValue("")
      router.refresh()
      onClose()
    }
  }, [session, router, onClose])

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
      setAuthMode("login")
      setAuthMessage("")
      setAuthStatus("error")
      setEmailInputValue("")
      setIsLoading(false)
      setPasswordInputValue("")
      onClose()
    }
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

    const passwordValidation = validateAuthPassword(passwordInputValue, authMode)
    if (typeof passwordValidation === "string") {
      setAuthStatus("error")
      setAuthMessage(passwordValidation)
      return
    }

    try {
      setAuthMessage("")
      setIsLoading(true)

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
          return
        }

        router.refresh()
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
          return
        }

        router.refresh()
        onClose()
        return
      }

      setAuthStatus("success")
      setAuthMessage("Check your email to confirm your account, then come back and log in.")
      setAuthMode("login")
      setPasswordInputValue("")
    } catch (error) {
      setAuthStatus("error")
      setAuthMessage(error instanceof Error ? error.message : "Unable to continue with credentials.")
    } finally {
      setIsLoading(false)
    }
  }

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
                  <h1 className="text-3xl font-semibold leading-tight text-white">
                    {authMode === "login" ? "Log in to your account" : "Create your account"}
                  </h1>
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
                  <Input
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/35"
                    disabled={isLoading}
                    onChange={event => setPasswordInputValue(event.target.value)}
                    placeholder={authMode === "login" ? "Password" : "Password (min 15 chars)"}
                    type="password"
                    value={passwordInputValue}
                  />

                  <Button
                    className="rounded-2xl border border-emerald-400/15 bg-emerald-500 px-4 py-3 text-sm font-semibold text-black"
                    disabled={isLoading}
                    type="submit">
                    <span className="flex items-center justify-center gap-2">
                      <span>{isLoading ? "Please wait..." : authMode === "login" ? "Continue with credentials" : "Register with credentials"}</span>
                      <HiOutlineArrowRight size={16} />
                    </span>
                  </Button>
                </form>

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs uppercase tracking-[0.2em] text-white/35">or</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <Button
                  className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black"
                  disabled={isLoading}
                  onClick={continueWithGithubFn}>
                  <span className="flex items-center justify-center gap-3">
                    <FaGithub size={18} />
                    <span>{isLoading ? "Redirecting to GitHub..." : "Continue with GitHub"}</span>
                  </span>
                </Button>

                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-white/60">
                  Credentials login uses Supabase email/password under this app’s existing session system, then syncs the
                  same `users_19_spotify` row shape used by GitHub auth.
                </div>
              </div>
            </div>
          </div>
        </div>
      </OrganicCanvasBackground>
    </Modal>
  )
}

export default AuthModal
