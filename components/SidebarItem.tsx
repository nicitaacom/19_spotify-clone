import Link from "next/link"
import { IconType } from "react-icons"
import { twMerge } from "tailwind-merge"

interface SidebarItemProps {
  icon:IconType
  label:string
  active?:boolean
  href:string
}

export default function SidebarItem ({icon:Icon,label,active,href}:SidebarItemProps) {
return (
    <Link className={twMerge(`flex flex-row gap-x-4 items-center h-auto w-full 
    text-md font-medium cursor-pointer hover:text-white
    transition text-neutral-400 py-1`,active && 'text-white')} href={href}>
      <Icon size={26}/>
      <p className="truncate w-full">{label}</p>
    </Link>
)
}