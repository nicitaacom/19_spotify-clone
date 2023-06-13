'use client'

import { useRouter } from "next/navigation";

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
    <div>
      Hello Header
    </div>
   );
}
 
export default Header;