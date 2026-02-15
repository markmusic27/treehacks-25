"use client"

import { motion, useMotionValue, useTransform, useSpring } from "framer-motion"
import { Music, Headphones, Sparkles, Zap, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { PillowButton } from "@/components/maestro/pillow-button"
import { FloatingNotes } from "@/components/maestro/floating-notes"
import { TalkingMascot } from "@/components/maestro/talking-mascot"
import { getProgress, touchVisit } from "@/lib/progress"
import { personas } from "@/lib/mock-data"

const features = [
  {
    href: "/select",
    personaId: "maestro-spirit",
    icon: Music,
    color: "var(--maestro-green)",
    bg: "rgba(88,204,2,0.12)",
    title: "Pick & Play",
    description: "Choose your instrument and favorite song, then start performing",
    emoji: "👻",
  },
  {
    href: "/remixes",
    personaId: "dj-remix",
    icon: Headphones,
    color: "var(--maestro-purple)",
    bg: "rgba(206,130,255,0.12)",
    title: "AI Remixes",
    description: "Last practiced songs — create Juno remixes in Jazz, Lo-Fi, EDM & more",
    emoji: "🎧",
  },
  {
    href: "/learn",
    personaId: "cultural-conductor",
    icon: Sparkles,
    color: "var(--maestro-gold)",
    bg: "rgba(255,200,0,0.12)",
    title: "Learn & Grow",
    description: "Tutoring: instruments, artists, songs — comprehensive guides",
    emoji: "🎵",
  },
]

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
}

const fadeUp = {
  initial: { opacity: 0, y: 40, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 200, damping: 20 },
  },
}

function HeroParticles() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: 30 + Math.random() * 60,
    size: 3 + Math.random() * 6,
    color: [
      "var(--maestro-green)",
      "var(--maestro-blue)",
      "var(--maestro-purple)",
      "var(--maestro-gold)",
      "var(--maestro-orange)",
    ][i % 5],
    delay: Math.random() * 6,
    dur: 6 + Math.random() * 8,
    driftX: -40 + Math.random() * 80,
    driftY: -80 - Math.random() * 60,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full opacity-0"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `particle-drift ${p.dur}s ${p.delay}s ease-in-out infinite`,
            ["--drift-x" as string]: `${p.driftX}px`,
            ["--drift-y" as string]: `${p.driftY}px`,
            ["--drift-x2" as string]: `${-p.driftX}px`,
            ["--drift-y2" as string]: `${p.driftY * 1.5}px`,
          }}
        />
      ))}
    </div>
  )
}

const maestroSpiritPersona = personas.find((p) => p.id === "maestro-spirit") ?? null

function HomepageMaestroSpirit() {
  const [progress, setProgress] = useState<ReturnType<typeof getProgress> | null>(null)

  useEffect(() => {
    setProgress(getProgress())
    touchVisit()
  }, [])

  const hasStats = (progress?.totalXP ?? 0) > 0 || (progress?.sessionsCompleted ?? 0) > 0
  const message = !hasStats
    ? "Welcome! Pick an instrument and a song — I'll be here when you get back."
    : "Welcome back! Keep it up."

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
      className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 w-full max-w-md"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <TalkingMascot persona={maestroSpiritPersona} size="lg" isSpeaking={false} />
      </motion.div>
      <div className="flex-1 text-left">
        <div
          className="relative px-4 py-3 rounded-2xl rounded-tl-sm sm:rounded-tl-none sm:rounded-bl-sm shadow-lg border border-border"
          style={{ backgroundColor: "var(--maestro-surface)" }}
        >
          <p className="text-sm font-semibold text-foreground">{message}</p>
          {hasStats && progress && (
            <p className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-0">
              <span>{progress.totalXP} XP</span>
              <span>{progress.sessionsCompleted} session{progress.sessionsCompleted !== 1 ? "s" : ""}</span>
              {progress.streakDays > 0 && (
                <span style={{ color: "var(--maestro-gold)" }}>🔥 {progress.streakDays}-day streak</span>
              )}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 font-medium">
          — Maestro Spirit
        </p>
      </div>
    </motion.div>
  )
}

function BouncingArrow() {
  return (
    <motion.div
      animate={{ y: [0, 6, 0] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <ArrowRight className="w-5 h-5" />
    </motion.div>
  )
}

function StatsBar() {
  const stats = [
    { label: "Instruments", value: "8+", color: "var(--maestro-green)" },
    { label: "Remix Styles", value: "6", color: "var(--maestro-blue)" },
    { label: "AI Feedback", value: "Real-time", color: "var(--maestro-purple)" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, type: "spring", stiffness: 150 }}
      className="flex items-center gap-6 md:gap-10"
    >
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 + i * 0.15, type: "spring", stiffness: 300, damping: 15 }}
        >
          <span className="text-2xl md:text-3xl font-black" style={{ color: s.color }}>
            {s.value}
          </span>
          <span className="text-xs text-muted-foreground font-semibold">{s.label}</span>
        </motion.div>
      ))}
    </motion.div>
  )
}

export default function HomeDashboardPage() {
  const [showCtaGlow, setShowCtaGlow] = useState(false)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 })
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 })
  const bgX = useTransform(springX, [0, 1], [-15, 15])
  const bgY = useTransform(springY, [0, 1], [-15, 15])

  useEffect(() => {
    const timer = setTimeout(() => setShowCtaGlow(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  function handleMouseMove(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set((e.clientX - rect.left) / rect.width)
    mouseY.set((e.clientY - rect.top) / rect.height)
  }

  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background"
      onMouseMove={handleMouseMove}
    >
      <FloatingNotes />
      <HeroParticles />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ x: bgX, y: bgY }}
        aria-hidden="true"
      >
        <div
          className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-[120px] opacity-30"
          style={{ backgroundColor: "var(--maestro-green)" }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full blur-[100px] opacity-25"
          style={{ backgroundColor: "var(--maestro-blue)" }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-48 h-48 rounded-full blur-[80px] opacity-20"
          style={{ backgroundColor: "var(--maestro-purple)" }}
        />
      </motion.div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 py-16 max-w-2xl text-center">
        <HomepageMaestroSpirit />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 18, delay: 0.25 }}
          className="flex flex-col items-center gap-3"
        >
          <h1 className="text-5xl md:text-7xl font-black text-balance tracking-tight text-gradient-animated">
            Maestro
          </h1>
          <motion.p
            className="text-xl md:text-2xl font-bold text-muted-foreground text-pretty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Learn. Play. Remix.
          </motion.p>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-base text-muted-foreground leading-relaxed max-w-md"
        >
          Pick your instrument, play your favorite song, and let AI remix your
          performance into entirely new styles. Then dive deep into technique,
          artist history, and music theory.
        </motion.p>

        <StatsBar />

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.7, type: "spring", stiffness: 200 }}
          className={showCtaGlow ? "animate-disco-glow rounded-2xl" : ""}
        >
          <Link href="/select">
            <PillowButton size="lg">
              <span className="flex items-center gap-2">
                Start Playing
                <BouncingArrow />
              </span>
            </PillowButton>
          </Link>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-4"
        >
          {features.map((feature, i) => {
            const persona = personas.find((p) => p.id === feature.personaId) ?? null
            return (
              <Link key={feature.title} href={feature.href}>
                <motion.div
                  variants={fadeUp}
                  whileHover={{
                    scale: 1.05,
                    y: -8,
                    boxShadow: `0 12px 40px ${feature.color}20`,
                  }}
                  whileTap={{ scale: 0.97 }}
                  className="relative flex flex-col items-center gap-3 p-6 rounded-2xl border border-border overflow-hidden cursor-pointer"
                  style={{ backgroundColor: feature.bg }}
                >
                  <motion.div
                    className="absolute inset-0 opacity-0"
                    whileHover={{ opacity: 1 }}
                    style={{
                      background: `radial-gradient(circle at 50% 0%, ${feature.color}15, transparent 70%)`,
                    }}
                  />
                  <motion.div
                    className="w-14 h-14 rounded-full flex items-center justify-center relative z-10"
                    style={{ backgroundColor: `${feature.color}25` }}
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                  >
                    <span className="text-2xl" aria-hidden>
                      {persona?.emoji ?? feature.emoji}
                    </span>
                  </motion.div>
                  <h3 className="font-bold text-foreground relative z-10">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center leading-relaxed relative z-10">
                    {feature.description}
                  </p>
                </motion.div>
              </Link>
            )
          })}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="text-xs text-muted-foreground flex items-center gap-1.5 mt-4"
        >
          <Zap className="w-3 h-3" style={{ color: "var(--maestro-gold)" }} />
          Powered by Suno AI, OpenAI & NVIDIA
        </motion.p>
      </div>
    </main>
  )
}
