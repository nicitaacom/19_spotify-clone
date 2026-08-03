"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FiDownload, FiUpload } from "react-icons/fi"

import { useUser } from "@/hooks/useUser"
import Button from "@/components/Button"
import { postData } from "@/libs/helpers"
import useDbBackupModal from "@/app/features/backup/useDbBackupModal"
import StorageUsageBar from "@/components/StorageUsageBar"
import useExclusivePlaybackPreference from "@/hooks/useExclusivePlaybackPreference"
import useUploadModal from "@/hooks/useUploadModal"

interface AccountContentProps {
  isOwner: boolean
}

const AccountContent = ({ isOwner }: AccountContentProps) => {
  const router = useRouter()
  const { isLoading, subscription, user } = useUser()
  const dbBackupModal = useDbBackupModal()
  const uploadModal = useUploadModal()

  const [loading, setLoading] = useState(false)
  const exclusivePlaybackHasHydrated = useExclusivePlaybackPreference(state => state.hasHydrated)
  const exclusivePlaybackEnabled = useExclusivePlaybackPreference(state =>
    user ? (state.enabledByUserId[user.id] ?? false) : false,
  )
  const setExclusivePlaybackEnabled = useExclusivePlaybackPreference(state => state.setEnabled)
  const isPusherConfigured = Boolean(process.env.NEXT_PUBLIC_PUSHER_APP_KEY)

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/")
    }
  }, [isLoading, user, router])

  const redirectToCustomerPortal = async () => {
    setLoading(true)
    try {
      const { url } = await postData({
        url: "/api/create-portal-link",
      })
      window.location.assign(url)
    } catch (error) {
      if (error) return alert((error as Error).message)
    }
    setLoading(false)
  }

  return (
    <div className="mb-7 px-6">
      <div className="flex flex-col gap-y-2">
        <p>Signed in as {user?.email ?? "your account"}.</p>
        <p className="text-sm text-neutral-400">Music playback is available for every logged-in user.</p>
      </div>

      {!subscription && (
        <div className="mt-6 flex flex-col gap-y-4">
          <p>No subscription is required to listen.</p>
        </div>
      )}
      {subscription && (
        <div className="mt-6 flex flex-col gap-y-4">
          <p>
            You also have an active
            <b> {subscription?.prices?.products?.name} </b>
            plan.
          </p>
          <Button disabled={loading || isLoading} onClick={redirectToCustomerPortal} className="w-[300px]">
            Open customer portal
          </Button>
        </div>
      )}

      {user && (
        <div className="mt-8 flex flex-col gap-y-3 border-t border-white/10 pt-6">
          <p className="text-sm font-semibold text-neutral-300">Playback</p>
          <div className="flex max-w-2xl items-center justify-between gap-6 rounded-lg border border-white/10 bg-elevated/60 p-4">
            <div className="flex flex-col gap-y-1">
              <label htmlFor="exclusive-playback-toggle" className="text-sm font-medium text-white">
                Stop music playing in other tabs
              </label>
              <p className="text-xs leading-5 text-neutral-400">
                Starting audio in the player, Slow &amp; Reverb, or 8D Generator pauses playback in
                every other open tab signed into this account.
              </p>
              <p className="text-xs text-neutral-500">
                Saved permanently in this browser until you turn it off or clear site data.
              </p>
              {!isPusherConfigured && (
                <p className="text-xs text-amber-400">
                  Playback synchronization is unavailable until Pusher Channels is configured.
                </p>
              )}
            </div>
            <button
              id="exclusive-playback-toggle"
              type="button"
              role="switch"
              aria-checked={exclusivePlaybackEnabled}
              aria-label="Stop music playing in other tabs"
              disabled={!exclusivePlaybackHasHydrated || !isPusherConfigured}
              onClick={() => setExclusivePlaybackEnabled(user.id, !exclusivePlaybackEnabled)}
              className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                exclusivePlaybackEnabled
                  ? "border-neon/60 bg-neon/30"
                  : "border-white/15 bg-neutral-700"
              } disabled:cursor-not-allowed disabled:opacity-50`}>
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  exclusivePlaybackEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {user && (
        <div className="mt-8 flex flex-col gap-y-3 border-t border-white/10 pt-6">
          <p className="text-sm font-semibold text-neutral-300">Storage</p>
          <p className="text-sm text-neutral-400">Total song storage used across the Supabase free tier.</p>
          <StorageUsageBar />
        </div>
      )}

      {user && (
        <div className="mt-8 flex flex-col gap-y-3 border-t border-white/10 pt-6">
          <p className="text-sm font-semibold text-neutral-300">Uploads</p>
          {isOwner ? (
            <>
              <p className="text-sm text-neutral-400">This account can add new songs to the library.</p>
              <button
                onClick={uploadModal.onOpen}
                className="flex w-[300px] items-center justify-center gap-x-2 rounded-md border border-neon/30 bg-elevated px-4 py-2.5 text-sm font-semibold text-neon transition hover:border-neon/60 hover:bg-elevated/80">
                <FiUpload size={15} />
                Upload song
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-400">
                Only the library owner can add songs. Backup and restore below is open to every signed-in account, so
                having it does not grant uploading.
              </p>
              <p className="text-sm text-neutral-400">
                This account id: <span className="select-all font-mono text-neutral-200">{user.id}</span>
              </p>
            </>
          )}
        </div>
      )}

      {user && (
        <div className="mt-8 flex flex-col gap-y-3 border-t border-white/10 pt-6">
          <p className="text-sm font-semibold text-neutral-300">Data Backup</p>
          <p className="text-sm text-neutral-400">
            Export your songs, playlists, and liked songs as a <span className="font-mono">.tar.gz</span> archive, or
            restore from a previous backup.
          </p>
          <button
            onClick={dbBackupModal.onOpen}
            className="flex w-[300px] items-center justify-center gap-x-2 rounded-md border border-neon/30 bg-elevated px-4 py-2.5 text-sm font-semibold text-neon transition hover:border-neon/60 hover:bg-elevated/80">
            <FiDownload size={15} />
            Backup &amp; Restore
          </button>
        </div>
      )}
    </div>
  )
}

export default AccountContent
