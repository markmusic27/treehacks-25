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
 * Lively character animation: float, gentle sway, scale pulse
 * so characters feel expressive and alive (Duolingo-style).
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

  const loopAnimations = () => {
    const floatY = [0, -14, 0]
    const sway = [0, -5, 5, 0]
    const pulse = [1, 1.06, 1]
    switch (motionVariant) {
      case "float":
        return { y: floatY }
      case "sway":
        return { rotate: sway }
      case "bounce":
        return { scale: pulse, y: [0, -8, 0] }
      default:
        return { y: floatY, rotate: sway, scale: pulse }
    }
  }

  const loop = loopAnimations()

  return (
    <motion.div
      className={`relative flex items-center justify-center overflow-visible ${className}`}
      style={{ width, minHeight: width }}
      initial={{ opacity: 0, scale: 0.85, y: 30 }}
      animate={{
        opacity: 1,
        scale: Array.isArray(loop.scale) ? loop.scale : 1,
        y: Array.isArray(loop.y) ? loop.y : 0,
        rotate: Array.isArray(loop.rotate) ? loop.rotate : 0,
      }}
      transition={{
        opacity: { duration: 0.4 },
        scale: {
          duration: 2.8,
          repeat: Infinity,
          ease: "easeInOut",
        },
        y: {
          duration: 2.8,
          repeat: Infinity,
          ease: "easeInOut",
        },
        rotate: {
          duration: 3.2,
          repeat: Infinity,
          ease: "easeInOut",
        },
      }}
    >
      {useImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain drop-shadow-xl select-none pointer-events-none"
          onError={() => setImgError(true)}
          draggable={false}
        />
      ) : (
        children
      )}
    </motion.div>
  )
}
