"use client"

import { motion } from "framer-motion"
import { Star } from "lucide-react"
import { ConfettiBurst } from "./confetti-burst"
import { useEffect, useState } from "react"

interface ScoreRevealProps {
  score: number
  stars: number
  xpEarned: number
}

export function ScoreReveal({ score, stars, xpEarned }: ScoreRevealProps) {
  const [showConfetti, setShowConfetti] = useState(false)
  const [animatedScore, setAnimatedScore] = useState(0)
  const [animatedXp, setAnimatedXp] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(true), 600)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const duration = 1500
    const steps = 60
    const scoreIncrement = score / steps
    const xpIncrement = xpEarned / steps
    let step = 0

    const interval = setInterval(() => {
      step++
      setAnimatedScore(Math.min(Math.round(scoreIncrement * step), score))
      setAnimatedXp(Math.min(Math.round(xpIncrement * step), xpEarned))
      if (step >= steps) clearInterval(interval)
    }, duration / steps)

    return () => clearInterval(interval)
  }, [score, xpEarned])

  return (
    <div className="flex flex-col items-center gap-6">
      <ConfettiBurst trigger={showConfetti} />

      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 200,
          damping: 15,
          delay: 0.2,
        }}
        className="w-36 h-36 rounded-full flex items-center justify-center"
        style={{
          background: `conic-gradient(var(--maestro-green) ${animatedScore * 3.6}deg, var(--maestro-surface) ${animatedScore * 3.6}deg)`,
        }}
      >
        <div className="w-28 h-28 rounded-full bg-background flex items-center justify-center">
          <span className="text-4xl font-bold text-foreground">
            {animatedScore}
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex gap-2"
      >
        {Array.from({ length: 5 }, (_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0, rotate: -30 }}
            animate={{
              opacity: 1,
              scale: i < stars ? 1 : 0.6,
              rotate: 0,
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 15,
              delay: 0.7 + i * 0.1,
            }}
          >
            <Star
              className="w-8 h-8"
              fill={i < stars ? "var(--maestro-gold)" : "transparent"}
              stroke={
                i < stars ? "var(--maestro-gold)" : "var(--muted-foreground)"
              }
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, type: "spring" }}
        className="flex items-center gap-2 px-5 py-2 rounded-full"
        style={{ backgroundColor: "var(--maestro-gold)20" }}
      >
        <span className="text-2xl font-bold" style={{ color: "var(--maestro-gold)" }}>
          +{animatedXp} XP
        </span>
      </motion.div>
    </div>
  )
}
