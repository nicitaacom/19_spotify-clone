'use client'
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import qs from 'query-string'

import useDebounce from "@/hooks/useDebounce"
import Input from "./Input"

	

export default function SearchInput () {

  const router = useRouter()

  const [value,setValue] = useState("")
  const debouncedValue = useDebounce<string>(value,500)

  useEffect(() => {
    const query = {
      title:debouncedValue
    }

    const url = qs.stringifyUrl({url:'/search',query:query})

    router.push(url)
  })

  return (
    <Input
     placeholder='What you want to listen to?'
     value={value}
     onChange={(e) => setValue(e.target.value)}
    />
  )
}