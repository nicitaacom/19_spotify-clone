'use client'

import {AiOutlineMenu} from 'react-icons/ai'
import Avatar from '../Avatar';
import { useCallback, useState } from 'react';
import MenuItem from './MenuItem';
import useRegisterModal from '@/app/hooks/useRegisterModal';
import useLoginModal from '@/app/hooks/useLoginModal';
import { signOut } from 'next-auth/react';
import { SafeUser } from '@/app/types/indes';

interface UserMenuProps {
  currentUser?:SafeUser | null
}

const UserMenu:React.FC<UserMenuProps> = ({currentUser}) => {
  const registerModal = useRegisterModal()
  const loginModal = useLoginModal()
  const [isOpen,setIsOpen] = useState(false)

  const toggleOpen = useCallback(() => {
    setIsOpen((value) => !value)
  },[])


  return ( 
    <div className="relative">
      <div className="flex flex-row items-center gap-3">
        <div className="hidden md:block text-sm font-semibold px-4 py-3 rounded-full hover:bg-neutral-100
        transition cursor-pointer" 
        onClick={() => {}}>
          Airbnb your home
        </div>
        <div className="p-4 md:py-1 md:px-2 border-[1px] border-neutral-200 flex flex-row items-center
        gap-3 rounded-full cursor-pointer hover:shadow-md transition" onClick={toggleOpen}>
            <AiOutlineMenu/>
            <div className='hidden md:block'>
              <Avatar/>
            </div>
        </div>
      </div>
      {isOpen && (
        <div className='absolute rounded-xl shadow-md w-[40vw] md:w-3/4 bg-white overflow-hidden
        right-0 top-12 text-sm'>
            <div className='flex flex-col cursor-pointer'>
              {currentUser 
              ? 
               <>
                <MenuItem label='My Trips' onClick={() => {}}/>
                <MenuItem label='My Favorites' onClick={() => {}}/>
                <MenuItem label='My reservations' onClick={() => {}}/>
                <MenuItem label='My propperties' onClick={() => {}}/>
                <MenuItem label='Airbnb my home' onClick={() => {}}/>
                <hr />
                <MenuItem label='Logout' onClick={() => signOut()}/>
                </>
               : 
              (
                <>
                <MenuItem label='Login' onClick={loginModal.onOpen}/>
                <MenuItem label='Sign up' onClick={registerModal.onOpen}/>
              </>
              )}
            </div>
        </div>
      )}
    </div>
   );
}
 
export default UserMenu;