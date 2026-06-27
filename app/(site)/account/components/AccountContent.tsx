"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FiDownload } from "react-icons/fi"

import { useUser } from "@/hooks/useUser"
import Button from "@/components/Button"
import { postData } from "@/libs/helpers"
import useDbBackupModal from "@/hooks/useDbBackupModal"

const AccountContent = () => {
  const router = useRouter()
  const { isLoading, subscription, user } = useUser()
  const dbBackupModal = useDbBackupModal()

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/")
    }
  }, [isLoading, user, router])

  const redirectToCustomerPortal = async () => {
    setLoading(true)
    try {
      const { url, error } = await postData({
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
