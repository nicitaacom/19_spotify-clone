"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FiCheck, FiCopy, FiExternalLink, FiLock } from "react-icons/fi"
import toast from "react-hot-toast"
import { PlaylistDetail } from "@/types"
import { useUser } from "@/hooks/useUser"
import useIsIframeAuth from "@/hooks/useIsIframeAuth"
import { handleAuthAction } from "@/app/utils/handleAuthAction"
import { getStripe } from "@/libs/stripeClient"
import { formatPlaylistPrice } from "@/libs/commerceRules"
import { errorText, httpErrorMessage } from "@/libs/errorText"
import Button from "@/components/Button"

export default function PlaylistPurchasePanel({
  playlist,
  showAnchor = true,
  onOpenCheckout,
}: {
  playlist: PlaylistDetail
  showAnchor?: boolean
  onOpenCheckout?: () => void
}) {
  const router = useRouter()
  const params = useSearchParams()
  const { user, isLoading } = useUser()
  const isIframe = useIsIframeAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [retry, setRetry] = useState(0)
  const commerce = playlist.commerce
  const owned = Boolean(commerce?.purchased || commerce?.can_manage)
  const sessionId = params.get("session_id")
  const checkoutState = params.get("checkout")
  const visibleMessage =
    message ||
    (checkoutState === "cancelled"
      ? "Checkout cancelled. You haven’t been charged."
      : checkoutState === "success" && !commerce?.purchased
      ? "Confirming your payment…"
      : "")

  useEffect(() => {
    if (checkoutState !== "success" || !sessionId || !user?.id || commerce?.purchased) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const confirm = async () => {
      try {
        const response = await fetch("/api/playlists/purchase-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, playlist_id: playlist.id }),
        })
        const bodyText = await response.text()
        if (stopped) return
        if (!response.ok) {
          throw new Error(httpErrorMessage({
            action: "Confirm playlist payment",
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            bodyText,
            contentType: response.headers.get("content-type") ?? "",
          }))
        }
        const body = JSON.parse(bodyText) as { status?: string }
        if (body.status === "paid") {
          setMessage("Payment confirmed. Your playlist is unlocked.")
          window.history.replaceState(null, "", window.location.pathname)
          router.refresh()
        } else if (body.status === "pending" && ++attempts < 8) timer = setTimeout(confirm, 2000)
        else
          setMessage(
            body.status === "pending"
              ? "Your payment is still being confirmed. Check again shortly; you don’t need to pay again."
              : "This purchase is not active. Please check your payment status."
          )
      } catch (error) {
        if (!stopped)
          setMessage(errorText(error))
      }
    }
    void confirm()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [user?.id, commerce?.purchased, playlist.id, router, retry, sessionId, checkoutState])

  const checkout = async () => {
    if (!user) {
      handleAuthAction({ isIframe })
      return
    }
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/playlists/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_id: playlist.id }),
      })
      const bodyText = await response.text()
      if (!response.ok) {
        throw new Error(httpErrorMessage({
          action: "Playlist checkout",
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          bodyText,
          contentType: response.headers.get("content-type") ?? "",
        }))
      }
      const body = JSON.parse(bodyText) as { purchased?: boolean; sessionId?: string }
      if (body.purchased) {
        router.refresh()
        return
      }
      if (!body.sessionId) {
        setMessage("Your payment is being confirmed. Check again shortly.")
        return
      }
      const stripe = await getStripe()
      if (!stripe) throw new Error("Stripe.js returned no checkout client.")
      const result = await stripe.redirectToCheckout({ sessionId: body.sessionId })
      if (result.error) throw result.error
    } catch (error) {
      setMessage(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const handleCopyYoutubeLink = async () => {
    if (!commerce?.youtube_url) return
    try {
      await navigator.clipboard.writeText(commerce.youtube_url)
      toast.success("YouTube link copied. Share it with anyone!")
    } catch {
      toast.error("Could not copy. Open the link and copy it from your address bar.")
    }
  }

  return (
    <aside
      id={showAnchor ? "playlist-access" : undefined}
      tabIndex={-1}
      className="scroll-mt-4 space-y-3 rounded-lg border border-neon/20 bg-elevated/60 p-4 focus:outline-neon lg:sticky lg:top-4">
      <div className="flex items-center gap-2">
        <span className="text-neon">{owned ? <FiCheck size={16} /> : <FiLock size={16} />}</span>
        <h2 className="text-sm font-semibold text-white">
          {commerce?.purchased ? "Purchased" : "Unlock this playlist"}
        </h2>
      </div>
      {owned ? (
        commerce?.youtube_url ? (
          <div className="space-y-1">
            <a
              href={commerce.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full bg-neon px-3 py-2 text-xs font-semibold text-black hover:bg-neon-strong">
              Open YouTube playlist <FiExternalLink />
            </a>
            <button
              onClick={handleCopyYoutubeLink}
              className="flex w-full items-center justify-center gap-2 py-2 text-xs text-neutral-300">
              <FiCopy />
              Copy YouTube link
            </button>
          </div>
        ) : null
      ) : commerce?.sales_enabled ? (
        <div className="space-y-2">
          <Button className="px-3 py-2 text-xs" disabled={busy || isLoading} onClick={onOpenCheckout ?? checkout}>
            {busy ? "Opening checkout…" : `Unlock this playlist — ${formatPlaylistPrice(commerce.price_cents)} once`}
          </Button>
          <p className="text-center text-[11px] text-neutral-400">One-time payment per playlist. No subscription.</p>
        </div>
      ) : (
        <p className="text-sm text-neutral-400">This playlist has no tracks available for purchase yet.</p>
      )}
      {visibleMessage && (
        <div role="status" className="space-y-2 rounded-lg bg-black/20 p-3 text-sm text-neutral-200">
          <p>{visibleMessage}</p>
          {!commerce?.purchased && checkoutState === "success" && (
            <button
              onClick={() => {
                setRetry(n => n + 1)
                router.refresh()
              }}
              className="text-neon">
              Check again
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
