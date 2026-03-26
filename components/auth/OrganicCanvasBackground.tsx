"use client"

import { useEffect, useRef } from "react"
import { twMerge } from "tailwind-merge"

type ParticleCanvas = {
  height: number
  width: number
}

class Particle {
  angle = 0
  canvas: ParticleCanvas
  currentRadius = 0
  hideDelay = 0
  hideTimer = 0
  isVisible = 1
  life = 0
  maxHideTime = 0
  noiseSpeed = 0
  noiseX = 0
  noiseY = 0
  opacity = 0
  pulse = 0
  radius = 0
  scale = 0
  scaleSpeed = 0
  targetScale = 1
  vx = 0
  vy = 0
  wanderAngle = 0
  wanderRadius = 0
  x = 0
  y = 0

  constructor(canvas: ParticleCanvas) {
    this.canvas = canvas
    this.reset()
    this.setupVisibility()
  }

  private hash(value: number) {
    let hashed = value
    hashed = ((hashed >> 16) ^ hashed) * 0x45d9f3b
    hashed = ((hashed >> 16) ^ hashed) * 0x45d9f3b
    hashed = (hashed >> 16) ^ hashed

    return (hashed / 0x100000000 + 0.5) * 2 - 1
  }

  private noise(value: number) {
    const integer = Math.floor(value)
    const fraction = value - integer
    const start = this.hash(integer)
    const end = this.hash(integer + 1)
    const smooth = fraction * fraction * (3 - 2 * fraction)

    return start + (end - start) * smooth
  }

  private setupVisibility() {
    this.isVisible = Math.random() < 0.7 ? 1 : 0
    this.hideDelay = Math.random() * 1800 + 1200
    this.maxHideTime = Math.random() * 900 + 600
    this.scale = this.isVisible ? 1 : 0
    this.targetScale = this.isVisible ? 1 : 0
    this.scaleSpeed = 0.02 + Math.random() * 0.03
  }

  reset() {
    const speedMultiplier = Math.random() * 0.4 + 0.2

    this.x = Math.random() * this.canvas.width
    this.y = Math.random() * this.canvas.height
    this.vx = (Math.random() - 0.5) * 0.4 * speedMultiplier
    this.vy = (Math.random() - 0.5) * 0.4 * speedMultiplier
    this.radius = Math.random() * 120 + 50
    this.opacity = Math.random() * 0.35 + 0.1
    this.pulse = Math.random() * 0.007 + 0.002
    this.life = Math.random() * 100
    this.noiseX = Math.random() * 1000
    this.noiseY = Math.random() * 1000
    this.noiseSpeed = (Math.random() * 0.002 + 0.0006) * (Math.random() * 0.4 + 0.2)
    this.wanderAngle = Math.random() * Math.PI * 2
    this.wanderRadius = Math.random() * 60 + 20
  }

  update() {
    this.hideTimer += 1

    if (this.isVisible && this.hideTimer > this.hideDelay) {
      this.targetScale = 0
      if (this.scale <= 0.05) {
        this.isVisible = 0
        this.hideTimer = 0
        this.hideDelay = Math.random() * 1800 + 1200
      }
    } else if (!this.isVisible && this.hideTimer > this.maxHideTime) {
      this.isVisible = 1
      this.targetScale = 1
      this.hideTimer = 0
      this.hideDelay = Math.random() * 2400 + 1800
      this.maxHideTime = Math.random() * 900 + 600
    }

    this.scale += (this.targetScale - this.scale) * this.scaleSpeed
    this.scale = Math.max(0, Math.min(1, this.scale))

    if (this.scale <= 0) {
      return
    }

    this.wanderAngle += (Math.random() - 0.5) * 0.08
    this.noiseX += this.noiseSpeed
    this.noiseY += this.noiseSpeed * 0.7

    const wanderX = Math.cos(this.wanderAngle) * this.wanderRadius
    const wanderY = Math.sin(this.wanderAngle) * this.wanderRadius
    const noiseForceX = this.noise(this.noiseX) * 0.15
    const noiseForceY = this.noise(this.noiseY) * 0.15

    this.vx += wanderX * 0.001 + noiseForceX * 0.08 + (Math.random() - 0.5) * 0.02
    this.vy += wanderY * 0.001 + noiseForceY * 0.08 + (Math.random() - 0.5) * 0.02
    this.vx *= 0.99
    this.vy *= 0.99

    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy)
    if (speed > 0.4) {
      this.vx = (this.vx / speed) * 0.4
      this.vy = (this.vy / speed) * 0.4
    }

    this.x += this.vx + Math.sin(this.angle * 0.4) * 0.05
    this.y += this.vy + Math.cos(this.angle * 0.6) * 0.05
    this.angle += 0.004
    this.life += this.pulse
    this.currentRadius = this.radius * (1 + Math.sin(this.life) * 0.3) * this.scale

    const margin = this.currentRadius

    if (this.x < -margin) this.x = this.canvas.width + margin
    if (this.x > this.canvas.width + margin) this.x = -margin
    if (this.y < -margin) this.y = this.canvas.height + margin
    if (this.y > this.canvas.height + margin) this.y = -margin
  }

  draw(ctx: CanvasRenderingContext2D, brandHsl: string) {
    if (this.scale <= 0) {
      return
    }

    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.currentRadius)
    const opacity = this.scale * this.opacity

    gradient.addColorStop(0, `hsla(${brandHsl}, ${opacity})`)
    gradient.addColorStop(0.45, `hsla(${brandHsl}, ${opacity * 0.45})`)
    gradient.addColorStop(1, "hsla(0, 0%, 0%, 0)")

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2)
    ctx.fill()
  }
}

interface OrganicCanvasBackgroundProps {
  brandHsl?: string
  children: React.ReactNode
  className?: string
  particleCount?: number
}

export const OrganicCanvasBackground = ({
  brandHsl = "142, 72%, 45%",
  children,
  className,
  particleCount = 7,
}: OrganicCanvasBackgroundProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) {
      return
    }

    const context = canvas.getContext("2d")
    if (!context) {
      return
    }

    const updateCanvasSize = () => {
      const { height, width } = container.getBoundingClientRect()
      const devicePixelRatio = window.devicePixelRatio || 1

      canvas.width = Math.floor(width) * devicePixelRatio
      canvas.height = Math.floor(height) * devicePixelRatio
      canvas.style.width = `${Math.floor(width)}px`
      canvas.style.height = `${Math.floor(height)}px`
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

      particlesRef.current = Array.from({ length: particleCount }, () =>
        new Particle({
          height: Math.floor(height),
          width: Math.floor(width),
        }),
      )
    }

    const animate = () => {
      const { height, width } = container.getBoundingClientRect()

      context.clearRect(0, 0, width, height)

      particlesRef.current.forEach(particle => {
        particle.update()
        particle.draw(context, brandHsl)
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }

      resizeTimeoutRef.current = setTimeout(updateCanvasSize, 100)
    }

    updateCanvasSize()
    animate()
    window.addEventListener("resize", handleResize)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      window.removeEventListener("resize", handleResize)
    }
  }, [brandHsl, particleCount])

  return (
    <div
      className={twMerge(
        "relative overflow-hidden rounded-[28px] border border-white/10 bg-[#06110b] shadow-[0_40px_120px_rgba(0,0,0,0.55)]",
        className,
      )}
      ref={containerRef}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_35%),linear-gradient(135deg,_rgba(7,18,12,0.96),_rgba(5,8,7,0.98))]" />
      <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />
      <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),transparent_24%,transparent_76%,rgba(255,255,255,0.04))]" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
