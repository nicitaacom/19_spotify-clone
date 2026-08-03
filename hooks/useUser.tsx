import { useEffect, useState, createContext, useContext } from "react"
import { Session, User } from "@supabase/supabase-js"

import supabaseClient from "@/libs/supabaseClient"
import { UserDetails, Subscription } from "@/types"

type UserContextType = {
  accessToken: string | null
  session: Session | null
  user: User | null
  userDetails: UserDetails | null
  isLoading: boolean
  subscription: Subscription | null
}

export const UserContext = createContext<UserContextType | undefined>(undefined)

export interface Props {
  [propName: string]: unknown
}

export const MyUserContextProvider = (props: Props) => {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  const [isLoadingData, setIsloadingData] = useState(false)
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)

  const user = session?.user ?? null
  const accessToken = session?.access_token ?? null

  // Takes over from SessionContextProvider: read the session once, then follow it.
  // onAuthStateChange fires on sign in, sign out and every token refresh, so no other component has
  // to know how the session arrived - they all read it from this context.
  useEffect(() => {
    let isActive = true

    supabaseClient.auth.getSession().then(({ data }) => {
      if (!isActive) return
      setSession(data.session)
      setIsLoadingUser(false)
    })

    const {
      data: { subscription: authSubscription },
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoadingUser(false)
    })

    return () => {
      isActive = false
      authSubscription.unsubscribe()
    }
  }, [])

  const getUserDetails = () => supabaseClient.from("19_users").select("*").maybeSingle()
  const getSubscription = () =>
    supabaseClient
      .from("19_subscriptions")
      .select("*, 19_prices(*, 19_products(*))")
      .in("status", ["trialing", "active"])
      .maybeSingle()

  useEffect(() => {
    const runFetchUserData = async () => {
      if (user && !isLoadingData && !userDetails && !subscription) {
        setIsloadingData(true)
        const results = await Promise.allSettled([getUserDetails(), getSubscription()])
        const userDetailsPromise = results[0]
        const subscriptionPromise = results[1]

        if (userDetailsPromise.status === "fulfilled") setUserDetails(userDetailsPromise.value.data as unknown as UserDetails)

        if (subscriptionPromise.status === "fulfilled") setSubscription(subscriptionPromise.value.data as Subscription)

        setIsloadingData(false)
      } else if (!user && !isLoadingUser && !isLoadingData) {
        setUserDetails(null)
        setSubscription(null)
      }
    }
    runFetchUserData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoadingUser])

  const value = {
    accessToken,
    session,
    user,
    userDetails,
    isLoading: isLoadingUser || isLoadingData,
    subscription,
  }

  return <UserContext.Provider value={value} {...props} />
}

export const useUser = () => {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error(`useUser must be used within a MyUserContextProvider.`)
  }
  return context
}
