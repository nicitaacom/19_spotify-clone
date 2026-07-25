"use client"

import type { ErrorInfo } from "next/error"
import { useEffect } from "react"

import useOnlineStatus from "@/hooks/useOnlineStatus"

export default function GlobalError({ error, unstable_retry }: ErrorInfo) {
  const isOnline = useOnlineStatus()

  useEffect(() => {
    console.error("[app] global error", error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#090b0a", color: "#fff", fontFamily: "Arial, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}>
          <div style={{ maxWidth: "440px", textAlign: "center" }}>
            <div style={{ color: "#4ade80", fontSize: "42px", marginBottom: "12px" }}>
              {isOnline ? "!" : "↯"}
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: "24px" }}>
              {isOnline ? "The app could not load" : "You’re offline"}
            </h1>
            <p style={{ margin: "0 0 24px", color: "#a3a3a3", lineHeight: 1.6 }}>
              {isOnline
                ? "A temporary connection or loading error interrupted the app."
                : "Reconnect to the internet, then try loading the app again."}
            </p>
            <button
              type="button"
              disabled={!isOnline}
              onClick={() => unstable_retry()}
              style={{
                border: 0,
                borderRadius: "999px",
                padding: "10px 20px",
                background: isOnline ? "#4ade80" : "#404040",
                color: isOnline ? "#000" : "#a3a3a3",
                fontWeight: 700,
                cursor: isOnline ? "pointer" : "not-allowed",
              }}>
              {isOnline ? "Try again" : "Waiting for connection…"}
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
