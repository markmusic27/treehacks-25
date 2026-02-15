"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import MaestroSpirit from "@/components/MaestroSpirit"
import RemixDJ from "@/components/RemixDJ"
import CulturalInstructor from "@/components/CulturalInstructor"

const features = [
  {
    href: "/select",
    color: "var(--maestro-green)",
    bg: "rgba(88,204,2,0.12)",
    title: "Pick & Play",
    description: "Choose your instrument and favorite song, then start performing",
    Character: MaestroSpirit,
  },
  {
    href: "/remixes",
    color: "var(--maestro-purple)",
    bg: "rgba(206,130,255,0.12)",
    title: "AI Remixes",
    description: "Last practiced songs — create Juno remixes in Jazz, Lo-Fi, EDM & more",
    Character: RemixDJ,
  },
  {
    href: "/learn",
    color: "var(--maestro-gold)",
    bg: "rgba(255,200,0,0.12)",
    title: "Learn & Grow",
    description: "Tutoring: instruments, artists, songs — comprehensive guides",
    Character: CulturalInstructor,
  },
]

const stagger = { animate: { transition: { staggerChildren: 0.12 } } }
const fadeUp = {
  initial: { opacity: 0, y: 40, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 200, damping: 20 },
  },
}

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-16">
      {/* Maestro logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mb-12 md:mb-16"
      >
        <h1 className="text-5xl md:text-7xl font-black text-balance tracking-tight text-gradient-animated">
          Maestro
        </h1>
      </motion.div>

      {/* 3 main capabilities */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl"
      >
        {features.map((feature) => {
          const Character = feature.Character
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
                <div className="relative z-10 flex justify-center min-h-[120px] items-center">
                  <Character width={120} />
                </div>
                <h2 className="font-bold text-foreground relative z-10 text-lg">
                  {feature.title}
                </h2>
                <p className="text-sm text-muted-foreground text-center leading-relaxed relative z-10">
                  {feature.description}
                </p>
              </motion.div>
            </Link>
          )
        })}
      </motion.div>
    </main>
  )
}
