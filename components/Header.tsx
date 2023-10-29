'use client'

import { useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { RxCaretLeft, RxCaretRight } from 'react-icons/rx'
import { HiHome } from "react-icons/hi";
import { BiSearch } from "react-icons/bi";
import { FaUserAlt } from "react-icons/fa";
import toast from "react-hot-toast";

import Button from "./Button";
import useAuthModal from "@/hooks/useAuthModal";
import { useUser } from "@/hooks/useUser";
import usePlayer from "@/hooks/usePlayer";

interface HeaderProps {
  children:React.ReactNode
  className?:string
}

const Header:React.FC<HeaderProps> = ({children,className}) => {

  const player = usePlayer()
  const authModal = useAuthModal()

  const router = useRouter()

  const supabaseClient = useSupabaseClient()
  const {user} = useUser()

  const handleLogout = async () => {
    const {error} = await supabaseClient.auth.signOut()
    player.reset()
    router.refresh()

    if (error) {
      toast.error(error.message)
    }
    else{
      toast.success('Logged out!')
    }
  }

  return ( 
    <div className={twMerge(`h-fit bg-gradient-to-b from-emerald-800 p-6`,className)}>
      <div className="w-full mb-4 flex justify-between items-center">
        <div className="hidden md:flex gap-x-2 items-center">
          <button className="rounded-full bg-black flex justify-center items-center hover:opacity-75 transition"
          onClick={() => router.back()}>
            <RxCaretLeft className="text-white" size={35} />
          </button>
          <button className="rounded-full bg-black flex justify-center items-center hover:opacity-75 transition"
          onClick={() => router.forward()}>
            <RxCaretRight className="text-white" size={35}/>
          </button>
        </div>
        <div className='flex md:hidden gap-x-2 items-center'>
          <button className="rounded-full p-2 bg-white flex items-center jusitfy-center hover:opacity-75 transition">
            <HiHome className="text-black" size={20}/>
          </button>
          <button className="rounded-full p-2 bg-white flex items-center jusitfy-center hover:opacity-75 transition">
            <BiSearch className="text-black" size={20}/>
          </button>
        </div>
        <div className="flex justufy-between items-center gap-x-4">
          {user ? <div className="flex gap-x-4 items-center">
            <Button onClick={handleLogout}>Logout</Button>
            <Button className="bg-white" onClick={() => router.push('/account')}>
              <FaUserAlt/>
            </Button>
          </div> 
          : 
          <>
            <div>
              <Button className="bg-transparent text-neutral-300 font-medium" onClick={authModal.onOpen}>
                Sign up
              </Button>
            </div>
            <div>
              <Button className="bg-white px-6 py-2" onClick={authModal.onOpen}>
                Log in
              </Button>
            </div>
          </>
          }
        </div>
      </div>
      {children}
    </div>
   );
}
 
export default Header;