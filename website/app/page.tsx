"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import CulturalInstructor from "@/components/CulturalInstructor"
import RemixDJ from "@/components/RemixDJ"

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 180, damping: 20 },
  },
}

const cards = [
  {
    href: "/tutor/select",
    color: "#FFC800",
    title: "Tutoring",
    description: "Instruments, artists, songs — AI-powered guides",
    Character: CulturalInstructor,
  },
  {
    href: "/select?mode=record",
    color: "#CE82FF",
    title: "Generate Song",
    description: "Record your performance and generate a song",
    Character: RemixDJ,
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-16 relative overflow-hidden">
      {/* Title */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="relative z-10 text-center mb-4"
      >
        <h1 className="text-5xl md:text-7xl font-black tracking-tight text-primary">
          Maestro
        </h1>
      </motion.div>

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="relative z-10 text-lg md:text-xl text-muted-foreground text-center max-w-md mb-10 font-semibold"
      >
        Learn any instrument. Play your favorite songs. Powered by AI.
      </motion.p>

      {/* CTA Button - Duolingo style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
        className="relative z-10"
      >
        <Link href="/select?mode=play">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="
              relative px-14 py-4 rounded-2xl text-white font-extrabold text-lg md:text-xl uppercase tracking-wider
              bg-primary border-b-4 border-[#A866CC]
              hover:bg-[#DCA0FF] active:border-b-0 active:mt-1
              transition-all duration-75 cursor-pointer
              shadow-none
            "
          >
            Start Playing
          </motion.button>
        </Link>
      </motion.div>

      {/* Feature cards — Tutoring & AI Remixes (instrument-card style) */}
      <div className="relative z-10 grid grid-cols-2 gap-4 w-full max-w-md mt-12">
        {cards.map((card, i) => {
          const Character = card.Character
          return (
            <Link key={card.title} href={card.href}>
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                  delay: 0.5 + i * 0.08,
                }}
                whileHover={{
                  scale: 1.03,
                  transition: { type: "spring", stiffness: 400, damping: 20 },
                }}
                whileTap={{ scale: 0.97 }}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-card cursor-pointer select-none"
                style={{
                  border: "2.5px solid var(--border)",
                  borderBottom: "4px solid var(--border)",
                }}
              >
                <div className="flex justify-center items-center h-[100px]">
                  <Character width={100} />
                </div>
                <p className="font-bold text-foreground text-base text-center">
                  {card.title}
                </p>
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  {card.description}
                </p>
              </motion.div>
            </Link>
          )
        })}
      </div>

      {/* Instrument pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        className="relative z-10 flex flex-wrap justify-center gap-3 mt-10"
      >
        {["Guitar", "Violin", "Cello", "Ukulele", "Bass", "Harp", "Banjo"].map((instrument) => (
          <span
            key={instrument}
            className="px-4 py-2 rounded-full bg-muted text-muted-foreground text-sm font-bold border-2 border-border"
          >
            {instrument}
          </span>
        ))}
      </motion.div>
    </main>
  )
}
