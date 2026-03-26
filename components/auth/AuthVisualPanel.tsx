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
    description: "Users can keep the quick provider path or use classic credentials if they do not want a GitHub dependency.",
    eyebrow: "Multi Auth",
    icon: MdOutlineAlternateEmail,
    points: ["GitHub", "Email + password", "One shared user table"],
    title: "Give every user a way in",
  },
  {
    description: "Likes stay tied to your user, so the app can treat auth the same way your SaaS project does.",
    eyebrow: "Persistent Identity",
    icon: HiOutlineHeart,
    points: ["User metadata saved", "Avatar synced", "Email retained"],
    title: "Keep your saved tracks attached to a real account",
  },
  {
    description: "Uploads, subscriptions, and future auth providers can all build on the same app-level user table.",
    eyebrow: "App-Level User",
    icon: MdOutlinePassword,
    points: ["Providers array", "Credentials ready", "Subscription ready"],
    title: "A SaaS-style auth foundation for Spotify",
  },
  {
    description: "Premium billing and future auth flows have cleaner ownership once the user record matches your SaaS structure.",
    eyebrow: "Ready For Growth",
    icon: MdOutlineWorkspacePremium,
    points: ["Stripe compatible", "More providers later", "Server callback flow"],
    title: "Built for more than a demo login",
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
    <div className="relative flex h-full flex-col justify-between overflow-hidden border-b border-white/10 bg-white/5 p-5 backdrop-blur-md md:min-h-[560px] md:border-b-0 md:border-r">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_28%)]" />
      <div className="relative z-10 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
          <HiOutlineSparkles size={14} />
          Organic Auth Scene
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
            exit={{ opacity: 0, y: -18 }}
            initial={{ opacity: 0, y: 18 }}
            key={activeSlide.title}
            transition={{ duration: 0.4, ease: "easeOut" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300/80">{activeSlide.eyebrow}</p>
            <h2 className="max-w-md text-2xl font-semibold leading-tight text-white md:text-[32px]">{activeSlide.title}</h2>
            <p className="max-w-lg text-sm leading-6 text-white/70 md:text-base">{activeSlide.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 mt-8 space-y-4">
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="rounded-[24px] border border-white/10 bg-black/30 p-4 shadow-[0_25px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl"
            exit={{ opacity: 0, scale: 0.96, y: -18 }}
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            key={`${activeSlide.title}-card`}
            transition={{ duration: 0.45, ease: "easeOut" }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: 0, scale: 1 }}
                  className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300"
                  initial={{ rotate: -10, scale: 0.92 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}>
                  <ActiveIcon size={24} />
                </motion.div>
                <div>
                  <p className="text-sm font-semibold text-white">{activeSlide.eyebrow}</p>
                  <p className="text-xs text-white/55">Imported from your SaaS auth pattern</p>
                </div>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                GitHub + credentials
              </div>
            </div>

            <div className="grid gap-3">
              {activeSlide.points.map((point, index) => (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
                  initial={{ opacity: 0, x: -14 }}
                  key={`${activeSlide.title}-${point}`}
                  transition={{ delay: index * 0.08, duration: 0.3, ease: "easeOut" }}>
                  <span className="text-sm text-white/80">{point}</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(34,197,94,0.8)]" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-2">
          {slides.map((slide, index) => (
            <button
              className={twMerge(
                "h-2 flex-1 rounded-full bg-white/10 transition-all duration-300",
                currentSlide === index && "bg-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.6)]",
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
