"use client"

import { motion } from "framer-motion"

interface WaveformVisualizerProps {
  isActive: boolean
  barCount?: number
  color?: string
  height?: number
}

export function WaveformVisualizer({
  isActive,
  barCount = 40,
  color = "var(--maestro-green)",
  height = 80,
}: WaveformVisualizerProps) {
  return (
    <div
      className="flex items-end justify-center gap-[2px]"
      style={{ height }}
      aria-label="Audio waveform visualization"
    >
      {Array.from({ length: barCount }, (_, i) => {
        const baseHeight = 20 + Math.sin(i * 0.5) * 30 + Math.random() * 30

        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: `${Math.max(100 / barCount - 1, 2)}%`,
              backgroundColor: color,
              opacity: isActive ? 0.9 : 0.3,
            }}
            animate={
              isActive
                ? {
                    height: [
                      `${baseHeight * 0.3}%`,
                      `${baseHeight}%`,
                      `${baseHeight * 0.5}%`,
                      `${baseHeight * 0.8}%`,
                      `${baseHeight * 0.3}%`,
                    ],
                  }
                : { height: "20%" }
            }
            transition={
              isActive
                ? {
                    duration: 0.8 + Math.random() * 0.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.02,
                  }
                : { duration: 0.5 }
            }
          />
        )
      })}
    </div>
  )
}
