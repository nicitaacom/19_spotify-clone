"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useUser } from "@/hooks/useUser"
import Button from "@/components/Button"
import { postData } from "@/libs/helpers"

const AccountContent = () => {
  const router = useRouter()
  const { isLoading, subscription, user } = useUser()

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
    </div>
  )
}

export default AccountContent
