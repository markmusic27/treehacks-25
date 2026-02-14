"use client"

import { motion } from "framer-motion"
import {
  Guitar,
  Piano,
  Music,
  Drum,
  Wind,
  Megaphone,
  Waves,
  Music2,
} from "lucide-react"
import type { Instrument } from "@/lib/types"
import { cn } from "@/lib/utils"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Guitar,
  Piano,
  Music,
  Drum,
  Wind,
  Megaphone,
  Waves,
  Music2,
}

interface InstrumentCardProps {
  instrument: Instrument
  isSelected: boolean
  onClick: () => void
  index: number
}

export function InstrumentCard({
  instrument,
  isSelected,
  onClick,
  index,
}: InstrumentCardProps) {
  const Icon = iconMap[instrument.icon] || Music

  return (
    <motion.button
      initial={{ opacity: 0, y: 40, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20,
        delay: index * 0.07,
      }}
      whileHover={{
        scale: 1.08,
        y: -6,
        boxShadow: `0 8px 30px ${instrument.color}30`,
        transition: { type: "spring", stiffness: 400, damping: 15 },
      }}
      whileTap={{ scale: 0.92, rotate: [-2, 2, 0] }}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-3 p-6 rounded-2xl border-b-4 transition-all cursor-pointer select-none overflow-hidden",
        isSelected
          ? "border-b-4"
          : "bg-maestro-surface border-b-maestro-surface-hover hover:bg-maestro-surface-hover"
      )}
      style={
        isSelected
          ? {
              backgroundColor: `${instrument.color}20`,
              borderBottomColor: instrument.color,
              borderColor: instrument.color,
              borderWidth: "2px",
              borderBottomWidth: "4px",
            }
          : undefined
      }
    >
      {/* Selection glow ring */}
      {isSelected && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0.2, 0.4, 0.2],
            boxShadow: [
              `inset 0 0 20px ${instrument.color}30`,
              `inset 0 0 40px ${instrument.color}20`,
              `inset 0 0 20px ${instrument.color}30`,
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <motion.div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${instrument.color}25` }}
        animate={
          isSelected
            ? { scale: [1, 1.15, 1], rotate: [0, -8, 8, 0] }
            : { rotate: [0, 3, -3, 0] }
        }
        transition={
          isSelected
            ? { duration: 0.5 }
            : { duration: 4, repeat: Infinity, delay: index * 0.3 }
        }
      >
        <Icon className="w-7 h-7" style={{ color: instrument.color }} />
      </motion.div>

      <div className="text-center relative z-10">
        <p className="font-bold text-foreground text-base">{instrument.name}</p>
        <p className="text-xs text-muted-foreground mt-1">{instrument.origin}</p>
      </div>

      <motion.span
        className="text-xs font-semibold px-2 py-0.5 rounded-full relative z-10"
        style={{
          backgroundColor: `${instrument.color}20`,
          color: instrument.color,
        }}
        animate={isSelected ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.3 }}
      >
        {instrument.difficulty}
      </motion.span>

      {/* Checkmark on selection */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: instrument.color, color: "#FFFFFF" }}
        >
          {"✓"}
        </motion.div>
      )}
    </motion.button>
  )
}
