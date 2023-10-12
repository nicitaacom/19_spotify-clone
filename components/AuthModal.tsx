'use client'
import { useSessionContext, useSupabaseClient } from "@supabase/auth-helpers-react"
import Modal from "./Modal"
import { useRouter } from "next/navigation"
import {ThemeSupa} from '@supabase/auth-ui-shared'
import { Auth } from "@supabase/auth-ui-react"
import useAtuhModal from "@/hooks/useAuthModal"
import { useEffect } from "react"
	

export default function AuthModal () {

const supabaseClient = useSupabaseClient()
const router = useRouter()
const {session} = useSessionContext()
const {isOpen,onClose} = useAtuhModal()

useEffect(() => {
if (session) {
  router.refresh()
  onClose()
}
},[session,router,onClose])

const onChange = (open:boolean) => {
  if (!open) {
onClose()
  }
}

return (
<Modal title="Welcome back" description="Log in into your account" isOpen={isOpen} onChange={onChange}>
  <Auth providers={['github']} theme='dark' supabaseClient={supabaseClient} appearance={{theme:ThemeSupa,variables:{
    default:{
      colors:{brand:'#404040',brandAccent:'#22c55e'}
    }
  }}} magicLink/>
</Modal>
)
}