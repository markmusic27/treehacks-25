"use client"

import { useState, Suspense } from "react"
import { motion } from "framer-motion"
import { ArrowRight, ArrowLeft } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { ProgressHeader } from "@/components/maestro/progress-header"
import { PillowButton } from "@/components/maestro/pillow-button"

// ---------- Tutor personalities ----------

type TutorPersonality = {
  id: string
  name: string
  style: string
  color: string
  emoji: string
  voice: string
}

const tutorPersonalities: TutorPersonality[] = [
  {
    id: "strict-sarah",
    name: "Strict Sarah",
    style: "Direct and no-nonsense. High standards, clear expectations — firm but fair. Your technique will thank her.",
    color: "#FF4444",
    emoji: "SA",
    voice: "ash",
  },
  {
    id: "mellow-maya",
    name: "Mellow Maya",
    style: "Laid-back and encouraging. Go with the flow — every note is a good note, and progress is a vibe.",
    color: "#4ECDC4",
    emoji: "MA",
    voice: "ballad",
  },
  {
    id: "energetic-ella",
    name: "Energetic Ella",
    style: "Upbeat and celebratory. Every win gets a shout-out — she keeps the energy sky-high the whole session.",
    color: "#FFC800",
    emoji: "EL",
    voice: "shimmer",
  },
  {
    id: "formal-fiona",
    name: "Formal Fiona",
    style: "Professional and articulate. Polished, respectful feedback — like a conservatory teacher.",
    color: "#6366F1",
    emoji: "FI",
    voice: "sage",
  },
]

// ---------- Page ----------

function PersonalityPickerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument") || ""
  const customName = searchParams.get("customName") || ""
  const gmProgram = searchParams.get("gmProgram") || ""

  const [selectedTutor, setSelectedTutor] = useState<TutorPersonality | null>(null)

  function handleContinue() {
    if (!selectedTutor) return
    const params = new URLSearchParams({ instrument: instrumentId, tutor: selectedTutor.id })
    if (customName) params.set("customName", customName)
    if (gmProgram) params.set("gmProgram", gmProgram)
    router.push(`/tutor/session?${params.toString()}`)
  }

  function handleBack() {
    router.push("/tutor/select")
  }

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <ProgressHeader
        currentStep={2}
        totalSteps={3}
        onClose={() => router.push("/")}
      />

      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-6 pb-32">
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4 mt-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-semibold">Back to instruments</span>
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex flex-col gap-8"
        >
          <div className="text-center">
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl md:text-4xl font-black text-foreground"
            >
              Choose your tutor
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-muted-foreground mt-2"
            >
              Each tutor has a unique personality and teaching style
            </motion.p>
          </div>

          {/* Tutor personality grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tutorPersonalities.map((tutor, i) => {
              const isSelected = selectedTutor?.id === tutor.id
              return (
                <motion.button
                  key={tutor.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    delay: 0.05 * i,
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedTutor(tutor)}
                  className="flex items-start gap-4 p-5 rounded-2xl text-left cursor-pointer select-none transition-all"
                  style={{
                    border: isSelected
                      ? `2.5px solid ${tutor.color}`
                      : "2.5px solid var(--border)",
                    borderBottom: isSelected
                      ? `4px solid ${tutor.color}`
                      : "4px solid var(--border)",
                    backgroundColor: isSelected
                      ? `${tutor.color}10`
                      : "var(--card)",
                  }}
                >
                  {/* Avatar circle */}
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 text-white font-black text-lg"
                    style={{ backgroundColor: tutor.color }}
                  >
                    {tutor.emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground text-lg">
                      {tutor.name}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {tutor.style}
                    </p>
                  </div>

                  {/* Selection indicator */}
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1"
                      style={{ backgroundColor: tutor.color }}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </motion.div>
                  )}
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </div>

      {/* Fixed bottom CTA */}
      {selectedTutor && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-40"
        >
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-semibold">
              Tutor:{" "}
              <span
                style={{ color: selectedTutor.color }}
                className="font-bold"
              >
                {selectedTutor.name}
              </span>
            </p>
            <PillowButton
              onClick={handleContinue}
              size="md"
              color={selectedTutor.color}
              darkColor={selectedTutor.color}
            >
              <span className="flex items-center gap-2">
                Start Session
                <ArrowRight className="w-5 h-5" />
              </span>
            </PillowButton>
          </div>
        </motion.div>
      )}
    </PageTransition>
  )
}

export default function PersonalityPickerPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <PersonalityPickerPage />
    </Suspense>
  )
}
