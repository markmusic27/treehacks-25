"use client"

import { motion } from "framer-motion"
import { useState } from "react"

interface AnimatedCharacterProps {
  /** Character image URL (e.g. /characters/maestro-spirit.png). */
  src?: string | null
  alt: string
  /** Fallback when no src or image fails (e.g. SVG or emoji). */
  children?: React.ReactNode
  /** Size in pixels for the container. */
  width?: number
  className?: string
  /** Slightly different motion for variety. */
  motion?: "float" | "sway" | "bounce" | "all"
}

/**
 * Smooth looping character animation.
 *
 * Each property uses `repeatType: "mirror"` so the animation
 * plays forward then reverses seamlessly — no jump at the seam.
 */
export default function AnimatedCharacter({
  src,
  alt,
  children,
  width = 220,
  className = "",
  motion: motionVariant = "all",
}: AnimatedCharacterProps) {
  const [imgError, setImgError] = useState(false)
  const useImage = src && !imgError

  /* ---- entrance (runs once) ---- */
  const enter = {
    opacity: { from: 0, to: 1, duration: 0.4 },
    scale: { from: 0.85, to: 1, duration: 0.45, ease: "easeOut" as const },
    y: { from: 20, to: 0, duration: 0.45, ease: "easeOut" as const },
  }

  /* ---- looping values per variant (mirror-friendly: single target) ---- */
  const floatY = -10
  const swayDeg = 3
  const pulse = 1.04
  const bounceDur = 3.2

  const buildAnimate = () => {
    switch (motionVariant) {
      case "float":
        return { opacity: 1, y: floatY, scale: 1, rotate: 0 }
      case "sway":
        return { opacity: 1, rotate: swayDeg, y: 0, scale: 1 }
      case "bounce":
        return { opacity: 1, y: -6, scale: pulse, rotate: 0 }
      default:
        return { opacity: 1, y: floatY, rotate: swayDeg, scale: pulse }
    }
  }

  const buildTransition = () => {
    const base = {
      opacity: { duration: enter.opacity.duration },
      y: {
        duration: bounceDur,
        repeat: Infinity,
        repeatType: "mirror" as const,
        ease: "easeInOut" as const,
      },
      scale: {
        duration: bounceDur,
        repeat: Infinity,
        repeatType: "mirror" as const,
        ease: "easeInOut" as const,
      },
      rotate: {
        duration: bounceDur + 0.6,
        repeat: Infinity,
        repeatType: "mirror" as const,
        ease: "easeInOut" as const,
      },
    }

    // Disable unused channels so they don't fight
    switch (motionVariant) {
      case "float":
        return { ...base, scale: { duration: 0 }, rotate: { duration: 0 } }
      case "sway":
        return { ...base, y: { duration: 0 }, scale: { duration: 0 } }
      case "bounce":
        return { ...base, rotate: { duration: 0 } }
      default:
        return base
    }
  }

  return (
    <motion.div
      className={`relative flex items-center justify-center overflow-visible ${className}`}
      style={{ width, minHeight: width }}
      initial={{ opacity: 0, scale: enter.scale.from, y: enter.y.from, rotate: 0 }}
      animate={buildAnimate()}
      transition={buildTransition()}
    >
      {useImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain select-none pointer-events-none"
          onError={() => setImgError(true)}
          draggable={false}
        />
      ) : (
        children
      )}
    </motion.div>
  )
}
