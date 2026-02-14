"use client"

import { motion } from "framer-motion"
import { Play, Clock, Gauge } from "lucide-react"
import type { Song } from "@/lib/types"
import { cn } from "@/lib/utils"

const difficultyColors = {
  beginner: "var(--maestro-green)",
  intermediate: "var(--maestro-orange)",
  advanced: "var(--maestro-red)",
}

interface SongCardProps {
  song: Song
  isSelected: boolean
  onClick: () => void
  index: number
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function SongCard({ song, isSelected, onClick, index }: SongCardProps) {
  const diffColor = difficultyColors[song.difficulty]

  return (
    <motion.button
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
        delay: index * 0.04,
      }}
      whileHover={{ scale: 1.01, x: 4 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer text-left",
        isSelected
          ? "border-2"
          : "bg-maestro-surface hover:bg-maestro-surface-hover border-2 border-transparent"
      )}
      style={
        isSelected
          ? {
              backgroundColor: `${diffColor}15`,
              borderColor: diffColor,
            }
          : undefined
      }
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${diffColor}20` }}
      >
        <Play className="w-5 h-5" style={{ color: diffColor }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground truncate">{song.title}</p>
        <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span
          className="text-xs font-semibold px-2 py-1 rounded-full"
          style={{
            backgroundColor: `${diffColor}20`,
            color: diffColor,
          }}
        >
          {song.difficulty}
        </span>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Gauge className="w-3 h-3" />
          <span>{song.bpm}</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatDuration(song.duration)}</span>
        </div>
      </div>
    </motion.button>
  )
}
