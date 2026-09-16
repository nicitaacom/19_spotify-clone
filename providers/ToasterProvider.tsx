"use client"

import { Toaster } from "react-hot-toast"

export default function ToasterProvider() {
  return <Toaster containerClassName="app-toast-viewport" toastOptions={{ style: { background: "#333333", color: "#ffffff" } }} />
}
