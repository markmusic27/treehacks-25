"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, Star, Heart, Flame, Zap, Trophy } from "lucide-react"

const icons = [Sparkles, Star, Heart, Flame, Zap, Trophy]

interface EncouragingPopupProps {
  message: string | null
}

export function EncouragingPopup({ message }: EncouragingPopupProps) {
  const RandomIcon = message ? icons[message.length % icons.length] : Sparkles

  return (
    <AnimatePresence mode="wait">
      {message && (
        <motion.div
          key={message}
          initial={{ opacity: 0, scale: 0.3, y: 40, rotate: -10 }}
          animate={{
            opacity: 1,
            scale: [0.3, 1.15, 0.95, 1.05, 1],
            y: 0,
            rotate: [10, -5, 3, 0],
          }}
          exit={{ opacity: 0, scale: 0.5, y: -30, rotate: 10 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 12,
          }}
          className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-7 py-3.5 rounded-full font-bold text-lg shadow-xl"
          style={{
            backgroundColor: "var(--maestro-green)",
            color: "#FFFFFF",
            boxShadow: "0 8px 32px rgba(88,204,2,0.4), 0 0 0 3px rgba(88,204,2,0.15)",
          }}
        >
          <motion.span
            animate={{ rotate: [0, -20, 20, -10, 10, 0], scale: [1, 1.3, 1] }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <RandomIcon className="w-5 h-5" />
          </motion.span>
          {message}
          <motion.span
            animate={{ rotate: [0, 20, -20, 10, -10, 0], scale: [1, 1.3, 1] }}
            transition={{ duration: 0.5, delay: 0.25 }}
          >
            <RandomIcon className="w-5 h-5" />
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
