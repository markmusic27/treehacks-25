"use client"

import { motion } from "framer-motion"
import { ArrowLeft, X } from "lucide-react"
import { useRouter } from "next/navigation"

interface ProgressHeaderProps {
  currentStep: number
  totalSteps: number
  onClose?: () => void
  showBack?: boolean
}

export function ProgressHeader({
  currentStep,
  totalSteps,
  onClose,
  showBack = true,
}: ProgressHeaderProps) {
  const router = useRouter()
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      {showBack && (
        <button
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      )}

      <div className="flex-1 h-4 bg-maestro-surface rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full relative shimmer"
          style={{ backgroundColor: "var(--maestro-green)" }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        />
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      )}
    </div>
  )
}
