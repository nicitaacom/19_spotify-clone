'use client'

import { useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";

import { RxCaretLeft, RxCaretRight } from 'react-icons/rx'
import { HiHome } from "react-icons/hi";
import { BiSearch } from "react-icons/bi";
import Button from "./Button";

interface HeaderProps {
  children:React.ReactNode
  className?:string
}

const Header:React.FC<HeaderProps> = ({children,className}) => {

  const router = useRouter()

  const handleLogout = () => {
    //Logout in the feature
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
          <>
            <div>
              <Button className="bg-transparent text-neutral-300 font-medium" onClick={() => {}}>
                Sign up
              </Button>
            </div>
            <div>
              <Button className="bg-white px-6 py-2" onClick={() => {}}>
                Log in
              </Button>
            </div>
          </>
        </div>
      </div>
      {children}
    </div>
   );
}
 
export default Header;