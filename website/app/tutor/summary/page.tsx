"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
  Home,
  RotateCcw,
  Music,
  Clock,
  Zap,
  Award,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { PillowButton } from "@/components/maestro/pillow-button"

// ---------- Types ----------

type SessionData = {
  instrumentId: string
  instrumentName: string
  tutorId: string
  tutorName: string
  elapsed: number
  noteCount: number
  midiEvents: {
    time: number
    midi_note: number
    velocity: number
    duration: number
    name: string
  }[]
}

// ---------- Tutor colors ----------

const TUTOR_COLORS: Record<string, string> = {
  "strict-sarah": "#FF4444",
  "mellow-maya": "#4ECDC4",
  "energetic-ella": "#FFC800",
  "formal-fiona": "#6366F1",
}

// ---------- Page ----------

export default function TutorSummaryPage() {
  const router = useRouter()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem("maestro_tutor_session")
    if (raw) {
      try {
        setSessionData(JSON.parse(raw))
      } catch {
        // invalid data
      }
    }
  }, [])

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const tutorColor = sessionData
    ? TUTOR_COLORS[sessionData.tutorId] || "#CE82FF"
    : "#CE82FF"

  // Calculate some stats
  const avgVelocity =
    sessionData && sessionData.midiEvents.length > 0
      ? Math.round(
          sessionData.midiEvents.reduce((a, e) => a + e.velocity, 0) /
            sessionData.midiEvents.length
        )
      : 0

  const uniqueNotes = sessionData
    ? new Set(sessionData.midiEvents.map((e) => e.name)).size
    : 0

  const notesPerMinute =
    sessionData && sessionData.elapsed > 0
      ? Math.round((sessionData.noteCount / sessionData.elapsed) * 60)
      : 0

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center gap-8 max-w-lg mx-auto w-full px-6 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 12, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl mb-4 text-sm font-bold select-none border-b-[3px]"
            style={{
              backgroundColor: tutorColor,
              borderBottomColor: `${tutorColor}CC`,
              color: "#fff",
            }}
          >
            <Award className="w-4 h-4" />
            Session Complete
          </motion.div>

          <h1 className="text-3xl md:text-4xl font-black text-foreground">
            Great Practice!
          </h1>

          {sessionData && (
            <p className="text-muted-foreground mt-2 font-semibold">
              {sessionData.instrumentName} session with{" "}
              <span style={{ color: tutorColor }} className="font-bold">
                {sessionData.tutorName}
              </span>
            </p>
          )}
        </motion.div>

        {/* Stats grid */}
        {sessionData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 gap-4 w-full"
          >
            {/* Duration */}
            <div
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-b-[3px]"
              style={{
                backgroundColor: "var(--card)",
                border: "2px solid var(--border)",
                borderBottom: "4px solid var(--border)",
              }}
            >
              <Clock className="w-6 h-6 text-muted-foreground" />
              <p className="text-3xl font-black text-foreground">
                {formatTime(sessionData.elapsed)}
              </p>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Duration
              </p>
            </div>

            {/* Notes played */}
            <div
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-b-[3px]"
              style={{
                backgroundColor: "var(--card)",
                border: "2px solid var(--border)",
                borderBottom: "4px solid var(--border)",
              }}
            >
              <Music className="w-6 h-6" style={{ color: tutorColor }} />
              <p className="text-3xl font-black" style={{ color: tutorColor }}>
                {sessionData.noteCount}
              </p>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Notes Played
              </p>
            </div>

            {/* Notes per minute */}
            <div
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-b-[3px]"
              style={{
                backgroundColor: "var(--card)",
                border: "2px solid var(--border)",
                borderBottom: "4px solid var(--border)",
              }}
            >
              <Zap className="w-6 h-6 text-yellow-500" />
              <p className="text-3xl font-black text-foreground">
                {notesPerMinute}
              </p>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Notes/min
              </p>
            </div>

            {/* Unique notes */}
            <div
              className="flex flex-col items-center gap-2 p-5 rounded-2xl border-b-[3px]"
              style={{
                backgroundColor: "var(--card)",
                border: "2px solid var(--border)",
                borderBottom: "4px solid var(--border)",
              }}
            >
              <Award className="w-6 h-6 text-purple-400" />
              <p className="text-3xl font-black text-foreground">
                {uniqueNotes}
              </p>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Unique Notes
              </p>
            </div>
          </motion.div>
        )}

        {/* MIDI events list (last few) */}
        {sessionData && sessionData.midiEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="w-full rounded-2xl border border-border p-5"
            style={{ backgroundColor: "var(--card)" }}
          >
            <h2 className="font-bold text-foreground text-sm mb-3">
              Recent Notes
            </h2>
            <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
              {sessionData.midiEvents.map((event, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "transparent" : "var(--maestro-surface)",
                  }}
                >
                  <span className="font-bold text-foreground">{event.name}</span>
                  <span className="text-muted-foreground">
                    {event.time.toFixed(1)}s &middot; vel {event.velocity} &middot;{" "}
                    {event.duration.toFixed(2)}s
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* No session data fallback */}
        {!sessionData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-muted-foreground"
          >
            <p className="font-semibold">No session data found.</p>
            <p className="text-sm mt-1">Start a tutoring session first.</p>
          </motion.div>
        )}

        {/* Navigation buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-4 pt-2"
        >
          <PillowButton
            onClick={() => {
              if (sessionData) {
                const params = new URLSearchParams({
                  instrument: sessionData.instrumentId,
                  tutor: sessionData.tutorId,
                })
                router.push(`/tutor/session?${params.toString()}`)
              } else {
                router.push("/tutor/select")
              }
            }}
            color={tutorColor}
            darkColor={`${tutorColor}CC`}
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Practice Again
            </span>
          </PillowButton>
          <PillowButton
            onClick={() => router.push("/")}
            color="#555"
            darkColor="#3a3a3a"
          >
            <span className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Home
            </span>
          </PillowButton>
        </motion.div>
      </div>
    </PageTransition>
  )
}
