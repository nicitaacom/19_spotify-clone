'use client'

import { MyUserContextProvider } from "@/hooks/useUser"

interface UserProviderProps {
  children:React.ReactNode
}

export default function UserProvider({children}:UserProviderProps) {
return (
  <MyUserContextProvider>
    {children}
  </MyUserContextProvider>
)
}