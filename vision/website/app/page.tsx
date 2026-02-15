"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import MaestroSpirit from "@/components/MaestroSpirit"

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 180, damping: 20 },
  },
}

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-16 relative overflow-hidden">
      {/* Mascot */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.1 }}
        className="relative z-10 mb-6"
      >
        <MaestroSpirit width={180} />
      </motion.div>

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
        <Link href="/select">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="
              relative px-14 py-4 rounded-2xl text-white font-extrabold text-lg md:text-xl uppercase tracking-wider
              bg-primary border-b-4 border-[#43C000]
              hover:bg-[#61D800] active:border-b-0 active:mt-1
              transition-all duration-75 cursor-pointer
              shadow-none
            "
          >
            Start Playing
          </motion.button>
        </Link>
      </motion.div>

      {/* Secondary info pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6 }}
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
