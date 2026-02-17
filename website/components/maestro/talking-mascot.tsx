"use client"

import { motion } from "framer-motion"
import type { Persona } from "@/lib/types"

interface TalkingMascotProps {
  /** Persona (e.g. Maestro Spirit). If null, uses a default conductor look. */
  persona?: Persona | null
  /** When true, plays a subtle "speaking" animation (bounce/scale). */
  isSpeaking?: boolean
  /** Size of the avatar. */
  size?: "sm" | "md" | "lg"
  /** Optional custom image URL (overrides persona.imageUrl). */
  imageUrl?: string | null
  className?: string
}

const sizeClasses = {
  sm: "w-12 h-12",
  md: "w-16 h-16",
  lg: "w-24 h-24 md:w-28 md:h-28",
}

export function TalkingMascot({
  persona,
  isSpeaking = false,
  size = "lg",
  imageUrl,
  className = "",
}: TalkingMascotProps) {
  const color = persona?.color ?? "var(--maestro-blue)"
  const emoji = persona?.emoji ?? "👻"
  const src = imageUrl ?? persona?.imageUrl
  const sizeClass = sizeClasses[size]

  return (
    <motion.div
      className={`relative rounded-full flex items-center justify-center overflow-hidden ${sizeClass} ${className}`}
      style={{ backgroundColor: `${color}20` }}
      animate={
        isSpeaking
          ? {
              scale: [1, 1.08, 1],
              y: [0, -4, 0],
            }
          : { scale: 1, y: 0 }
      }
      transition={{
        duration: 0.6,
        repeat: isSpeaking ? Infinity : 0,
        ease: "easeInOut",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={persona?.name ?? "Mascot"}
          className="w-full h-full object-contain"
        />
      ) : (
        <span
          className="text-3xl md:text-4xl select-none"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
          aria-hidden
        >
          {emoji}
        </span>
      )}
    </motion.div>
  )
}
