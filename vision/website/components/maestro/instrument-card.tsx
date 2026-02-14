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
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20,
        delay: index * 0.05,
      }}
      whileHover={{
        scale: 1.03,
        transition: { type: "spring", stiffness: 400, damping: 20 },
      }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative flex flex-col items-center gap-3 p-6 rounded-2xl transition-all cursor-pointer select-none bg-white"
      style={{
        border: isSelected
          ? `2.5px solid ${instrument.color}`
          : "2.5px solid #E5E5E5",
        borderBottom: isSelected
          ? `4px solid ${instrument.color}`
          : "4px solid #E5E5E5",
      }}
    >
      <motion.div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${instrument.color}18` }}
      >
        <Icon className="w-7 h-7" style={{ color: instrument.color }} />
      </motion.div>

      <div className="text-center relative z-10">
        <p className="font-bold text-[#4B4B4B] text-base">{instrument.name}</p>
        <p className="text-xs text-[#AFAFAF] mt-1">{instrument.origin}</p>
      </div>

      <span
        className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
        style={{
          backgroundColor: `${instrument.color}15`,
          color: instrument.color,
        }}
      >
        {instrument.difficulty}
      </span>

      {/* Checkmark on selection */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
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
