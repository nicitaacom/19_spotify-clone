"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { IconType } from "react-icons"
import { HiOutlineHeart, HiOutlineSparkles } from "react-icons/hi2"
import { MdOutlineAlternateEmail, MdOutlinePassword, MdOutlineWorkspacePremium } from "react-icons/md"
import { twMerge } from "tailwind-merge"

type Slide = {
  description: string
  eyebrow: string
  icon: IconType
  points: string[]
  title: string
}

const slides: Slide[] = [
  {
    description: "Log in with GitHub or email and password. Your account is always yours across every device.",
    eyebrow: "Easy Sign In",
    icon: MdOutlineAlternateEmail,
    points: ["GitHub OAuth", "Email + password", "Secure sessions"],
    title: "Your music, your account",
  },
  {
    description: "Heart any song and it stays in your library forever — tied to your account, not your browser.",
    eyebrow: "Saved Tracks",
    icon: HiOutlineHeart,
    points: ["Like any song", "Instant library sync", "Never lose a playlist"],
    title: "Keep every song you love",
  },
  {
    description: "Upload your own tracks and manage them alongside everything you've discovered on the platform.",
    eyebrow: "Upload Music",
    icon: MdOutlinePassword,
    points: ["Upload audio files", "Add cover art", "Manage your songs"],
    title: "Share your own music",
  },
  {
    description: "Unlock premium features and support the platform with a simple monthly subscription.",
    eyebrow: "Go Premium",
    icon: MdOutlineWorkspacePremium,
    points: ["No ads", "Higher quality audio", "Early access features"],
    title: "Upgrade your listening experience",
  },
]

export const AuthVisualPanel = () => {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentSlide(slide => (slide + 1) % slides.length)
    }, 3500)

    return () => window.clearInterval(interval)
  }, [])

  const activeSlide = slides[currentSlide]
  const ActiveIcon = activeSlide.icon

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden border-b border-white/10 bg-white/5 p-4 backdrop-blur-md md:min-h-[480px] md:border-b-0 md:border-r">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_28%)]" />
      <div className="relative z-10 space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
          <HiOutlineSparkles size={13} />
          Spotify Clone
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
            exit={{ opacity: 0, y: -18 }}
            initial={{ opacity: 0, y: 18 }}
            key={activeSlide.title}
            transition={{ duration: 0.4, ease: "easeOut" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neon/80">{activeSlide.eyebrow}</p>
            <h2 className="max-w-md text-xl font-semibold leading-tight text-white md:text-[26px]">{activeSlide.title}</h2>
            <p className="max-w-lg text-sm leading-5 text-white/70">{activeSlide.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 mt-5 space-y-3">
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="rounded-[18px] border border-white/10 bg-black/30 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl"
            exit={{ opacity: 0, scale: 0.96, y: -18 }}
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            key={`${activeSlide.title}-card`}
            transition={{ duration: 0.45, ease: "easeOut" }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <motion.div
                  animate={{ rotate: 0, scale: 1 }}
                  className="rounded-xl bg-neon/15 p-2 text-neon"
                  initial={{ rotate: -10, scale: 0.92 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}>
                  <ActiveIcon size={20} />
                </motion.div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{activeSlide.eyebrow}</p>
                  <p className="text-xs text-white/55">Spotify Clone</p>
                </div>
              </div>
              <div className="shrink-0 rounded-full border border-neon/20 bg-neon/10 px-2.5 py-1 text-[11px] font-medium text-neon/80">
                Free
              </div>
            </div>

            <div className="grid gap-2">
              {activeSlide.points.map((point, index) => (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                  initial={{ opacity: 0, x: -14 }}
                  key={`${activeSlide.title}-${point}`}
                  transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}>
                  <span className="text-xs text-white/80">{point}</span>
                  <span className="h-2 w-2 rounded-full bg-neon shadow-[0_0_6px_rgba(74,222,128,0.3)]" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-2">
          {slides.map((slide, index) => (
            <button
              className={twMerge(
                "h-1.5 flex-1 rounded-full bg-white/10 transition-all duration-300",
                currentSlide === index && "bg-neon shadow-[0_0_6px_rgba(74,222,128,0.3)]",
              )}
              key={slide.title}
              onClick={() => setCurrentSlide(index)}
              type="button"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
