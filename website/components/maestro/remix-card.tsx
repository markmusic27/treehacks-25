"use client"

import { motion } from "framer-motion"
import { Play, Pause } from "lucide-react"
import type { Remix, Persona } from "@/lib/types"

interface RemixCardProps {
  remix: Remix
  persona?: Persona | null
  isPlaying: boolean
  onTogglePlay: () => void
  index: number
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function RemixCard({
  remix,
  persona,
  isPlaying,
  onTogglePlay,
  index,
}: RemixCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
        delay: index * 0.08,
      }}
      whileHover={{ scale: 1.04, y: -4 }}
      className="shrink-0 w-52 rounded-2xl overflow-hidden cursor-pointer select-none"
      onClick={onTogglePlay}
      role="button"
      tabIndex={0}
      aria-label={`${isPlaying ? "Pause" : "Play"} ${remix.style.name} remix`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onTogglePlay()
        }
      }}
    >
      {/* Album art gradient */}
      <div
        className="h-52 w-full relative flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${remix.coverGradient[0]}, ${remix.coverGradient[1]})`,
        }}
      >
        {/* Equalizer bars when playing */}
        {isPlaying && (
          <div className="absolute inset-0 flex items-end justify-center gap-1 p-6 opacity-40">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="w-2 bg-white/80 rounded-full"
                style={{
                  animation: `eq-bar ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.1}s`,
                  height: "20%",
                }}
              />
            ))}
          </div>
        )}

        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center z-10"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white" />
          ) : (
            <Play className="w-6 h-6 text-white ml-0.5" />
          )}
        </motion.div>
      </div>

      {/* Info */}
      <div className="p-4 bg-maestro-surface">
        <p className="font-bold text-foreground text-sm">{remix.style.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {persona && (
            <span
              className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium"
              style={{
                backgroundColor: `${persona.color}20`,
                color: persona.color,
              }}
            >
              <span aria-hidden>{persona.emoji}</span>
              {persona.name}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDuration(remix.duration)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
