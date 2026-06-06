"use client"

import { useCallback, useEffect, useRef } from "react"
import { useSessionContext, useSupabaseClient } from "@supabase/auth-helpers-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import { FaGithub } from "react-icons/fa"
import { FcGoogle } from "react-icons/fc"
import { IoMdClose } from "react-icons/io"
import { MdOutlineErrorOutline } from "react-icons/md"

import useAuthModal from "@/hooks/useAuthModal"
import { useVerifyHuman } from "@/hooks/useVerifyHuman"
import { useAuthStore } from "@/hooks/useAuthStore"
import { verifyTurnstileTokenFn } from "@/app/utils/verifyTurnstileToken"
import { getURL } from "@/app/utils/getURL"

import Modal from "./Modal"
import Button from "./Button"
import TurnstileChallenge from "./TurnstileChallenge"
import { OrganicCanvasBackground } from "./auth/OrganicCanvasBackground"
import { AuthVisualPanel } from "./auth/AuthVisualPanel"
import { AuthModeButton } from "./auth/form/AuthModeButton"
import { LoginForm } from "./auth/form/LoginForm"
import { RegisterForm } from "./auth/form/RegisterForm"
import { RecoveryForm } from "./auth/form/RecoveryForm"
import { AuthFormProps, SupabaseClient } from "./auth/form/types"

const statusStyles = {
  error: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  info: "border-sky-400/20 bg-sky-400/10 text-sky-100",
  success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
} as const

const AuthModal = () => {
  const { session } = useSessionContext()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { onClose, onOpen, isOpen } = useAuthModal()
  const supabaseClient = useSupabaseClient()
  const turnstileRef = useRef<HTMLDivElement>(null)

  const { authMode, authMessage, authStatus, setAuthMessage, setAuthStatus, setIsLoading, resetAuthState } =
    useAuthStore()

  const { isVerified, token, resetTurnstileFn, shouldRenderChallenge } = useVerifyHuman(turnstileRef, {
    isEnabled: isOpen,
  })

  const isHumanGateEnabled = Boolean(process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY)
  const isActionBlocked = useAuthStore(s => s.isLoading) || (isHumanGateEnabled && !isVerified)

  const fullResetFn = useCallback(() => {
    resetAuthState()
    resetTurnstileFn()
  }, [resetAuthState, resetTurnstileFn])

  const onChange = useCallback(
    (open: boolean) => {
      if (!open) {
        fullResetFn()
        onClose()
      }
    },
    [fullResetFn, onClose],
  )

  useEffect(() => {
    if (!session) return
    fullResetFn()
    router.refresh()
    onClose()
  }, [onClose, fullResetFn, router, session])

  useEffect(() => {
    const authError = searchParams.get("auth_error")
    if (!authError) return
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    nextSearchParams.delete("auth_error")
    setAuthStatus("error")
    setAuthMessage(authError)
    toast.error(authError)
    onOpen()
    router.replace(nextSearchParams.toString() ? `${pathname}?${nextSearchParams.toString()}` : pathname)
  }, [onOpen, pathname, router, searchParams, setAuthMessage, setAuthStatus])

  const ensureHumanVerifiedFn = async (): Promise<true | string> => {
    const isDev = process.env.NODE_ENV !== "production"
    if (!isHumanGateEnabled || isDev) return true
    if (!isVerified || !token) return "Complete the Cloudflare challenge before continuing."
    const verifyResp = await verifyTurnstileTokenFn(token)
    if (typeof verifyResp === "string") {
      resetTurnstileFn()
      return verifyResp
    }
    return true
  }

  const syncCurrentUserFn = async (provider: string): Promise<true | string> => {
    const response = await fetch("/api/auth/sync-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      return body.error ?? "Unable to sync your account."
    }
    return true
  }

  const continueWithOAuthFn = async (provider: "github" | "google") => {
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
        provider,
        options: { redirectTo: getURL(`/auth/callback/oauth?provider=${provider}`) },
      })
      if (error) {
        setAuthStatus("error")
        setAuthMessage(error.message)
        toast.error(error.message)
        setIsLoading(false)
      }
    } catch (error) {
      setIsLoading(false)
      const msg = error instanceof Error ? error.message : `Unable to start ${provider} login.`
      setAuthMessage(msg)
      toast.error(msg)
    }
  }

  const formProps: AuthFormProps = {
    isActionBlocked,
    supabaseClient: supabaseClient as unknown as SupabaseClient,
    isHumanGateEnabled,
    isVerified,
    token,
    onClose: () => onChange(false),
    syncCurrentUserFn,
    ensureHumanVerifiedFn,
    resetTurnstileFn,
  }

  return (
    <Modal
      contentClassName="h-[calc(100%-32px)] max-h-[calc(100%-32px)] w-[calc(100%-32px)] border-0 bg-transparent p-0 md:h-auto md:max-h-[92vh] md:max-w-[960px]"
      isShowCloseButton={false}
      hideHeader
      isOpen={isOpen}
      onChange={onChange}
      title="Account authentication"
      description="Log in with GitHub or credentials to access your Spotify clone account.">
      <OrganicCanvasBackground className="rounded-[28px]">
        <button
          aria-label="Close"
          className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white focus:outline-none"
          onClick={() => onChange(false)}
          type="button">
          <IoMdClose size={18} />
        </button>

        <div className="grid md:grid-cols-[1.08fr_0.92fr]">
          <AuthVisualPanel />

          <div className="relative flex flex-col justify-center p-5 md:p-8">
            <div className="space-y-6 rounded-[24px] border border-white/10 bg-black/25 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-7">
              <h1 className="text-2xl font-semibold leading-tight text-white">
                {authMode === "login"
                  ? "Log in to your account"
                  : authMode === "register"
                    ? "Create your account"
                    : "Recover your password"}
              </h1>

              <AuthModeButton />

              {authMessage && (
                <div className={`rounded-2xl border p-4 text-sm ${statusStyles[authStatus]}`}>
                  <div className="flex items-start gap-3">
                    <MdOutlineErrorOutline className="mt-0.5 shrink-0" size={18} />
                    <p className="leading-6">{authMessage}</p>
                  </div>
                </div>
              )}

              {shouldRenderChallenge && (
                <TurnstileChallenge
                  isVerified={isVerified}
                  onDismiss={() => onChange(false)}
                  turnstileRef={turnstileRef}
                />
              )}

              <div className="space-y-3">
                {authMode === "login" && <LoginForm {...formProps} />}
                {authMode === "register" && <RegisterForm {...formProps} />}
                {authMode === "recover" && <RecoveryForm {...formProps} />}

                {authMode !== "recover" && (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-xs uppercase tracking-[0.2em] text-white/35">or</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <Button
                      className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black"
                      disabled={isActionBlocked}
                      onClick={() => continueWithOAuthFn("github")}>
                      <span className="flex items-center justify-center gap-3">
                        <FaGithub size={18} />
                        <span>Continue with GitHub</span>
                      </span>
                    </Button>

                    <Button
                      className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black"
                      disabled={isActionBlocked}
                      onClick={() => continueWithOAuthFn("google")}>
                      <span className="flex items-center justify-center gap-3">
                        <FcGoogle size={18} />
                        <span>Continue with Google</span>
                      </span>
                    </Button>
                  </>
                )}

                {isHumanGateEnabled && !isVerified ? (
                  <p className="text-center text-xs text-white/50">Cloudflare check required</p>
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
