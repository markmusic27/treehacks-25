"use client"

import { useMemo, Suspense, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { RotateCcw, Home, ChevronRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { PillowButton } from "@/components/maestro/pillow-button"
import { ScoreReveal } from "@/components/maestro/score-reveal"
import { WaveformVisualizer } from "@/components/maestro/waveform-visualizer"
import { generateMockResult, instruments, instructors } from "@/lib/mock-data"
import { recordSession } from "@/lib/progress"
import { getSong } from "@/lib/songs"

function ResultsDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument") || "guitar"
  const songId = searchParams.get("song") || "twinkle"
  const instructorId = searchParams.get("instructor")
  const isNewSession = searchParams.get("new") === "1"

  const instrument = instruments.find((i) => i.id === instrumentId)
  const song = getSong(songId)
  const instructor = instructorId ? instructors.find((i) => i.id === instructorId) : null

  const result = useMemo(
    () => generateMockResult(songId, instrumentId, undefined, song),
    [songId, instrumentId, song]
  )

  const hasRecordedProgress = useRef(false)
  useEffect(() => {
    if (!isNewSession || hasRecordedProgress.current) return
    hasRecordedProgress.current = true
    recordSession(result.xpEarned, songId, instrumentId)
  }, [isNewSession, result.xpEarned, songId, instrumentId])

  return (
    <PageTransition className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto w-full px-6 py-8 flex flex-col gap-10">
        {/* Session header */}
        <section className="flex flex-col items-center gap-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-3xl md:text-4xl font-black text-foreground">
              Session complete
            </h1>
            <p className="text-muted-foreground mt-2">
              {song?.title} — {song?.artist}
              {instrument && (
                <span
                  className="font-semibold ml-1"
                  style={{ color: instrument.color }}
                >
                  ({instrument.name})
                </span>
              )}
              {instructor && (
                <span className="text-muted-foreground ml-1">
                  with {instructor.name}
                </span>
              )}
            </p>
          </motion.div>

          <ScoreReveal
            score={result.score}
            stars={result.stars}
            xpEarned={result.xpEarned}
          />

          {/* Placeholder metrics (to be defined later) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5 }}
            className="w-full max-w-sm flex flex-col gap-3"
          >
            {[
              { label: "Accuracy", value: result.accuracy, color: "var(--maestro-green)" },
              { label: "Rhythm", value: result.rhythm, color: "var(--maestro-blue)" },
              { label: "Timing", value: result.timing, color: "var(--maestro-purple)" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-16 shrink-0">
                  {stat.label}
                </span>
                <div className="flex-1 h-3 bg-maestro-surface rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: stat.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${stat.value}%` }}
                    transition={{ delay: 1.8, duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <span
                  className="text-sm font-bold w-10 text-right"
                  style={{ color: stat.color }}
                >
                  {stat.value}%
                </span>
              </div>
            ))}
          </motion.div>

          {/* Your recording placeholder */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="w-full max-w-lg p-4 rounded-2xl bg-maestro-surface"
          >
            <p className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider">
              Your recording
            </p>
            <WaveformVisualizer
              isActive={false}
              barCount={60}
              color={instrument?.color || "var(--maestro-green)"}
              height={50}
            />
          </motion.div>
        </section>

        {/* Session feedback analysis — only content on this page */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2 }}
          className="rounded-2xl border border-border bg-maestro-surface p-6"
        >
          <h2 className="text-xl font-black text-foreground mb-3">
            Session feedback analysis
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Overall feedback for this session. Performance indicators and metrics will be refined later.
          </p>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-foreground leading-relaxed">
              {result.technique.summary}
            </p>
            {result.technique.strengths.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                  Strengths
                </h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  {result.technique.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.technique.tips.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                  Tips for next time
                </h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1">
                  {result.technique.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </motion.section>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.5 }}
          className="flex flex-col md:flex-row items-center gap-4 pb-10"
        >
          <PillowButton
            onClick={() => {
              const params = new URLSearchParams({
                instrument: instrumentId,
                song: songId,
              })
              if (instructorId) params.set("instructor", instructorId)
              router.push(`/play?${params.toString()}`)
            }}
            size="md"
            color="var(--maestro-orange)"
            darkColor="#CC7A00"
            fullWidth
          >
            <span className="flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Play again
            </span>
          </PillowButton>

          <PillowButton
            onClick={() => router.push("/select")}
            size="md"
            variant="outline"
            color="var(--maestro-green)"
            fullWidth
          >
            <span className="flex items-center justify-center gap-2">
              New song
              <ChevronRight className="w-5 h-5" />
            </span>
          </PillowButton>

          <PillowButton
            onClick={() => router.push("/")}
            size="md"
            variant="outline"
            color="var(--muted-foreground)"
            fullWidth
          >
            <span className="flex items-center justify-center gap-2">
              <Home className="w-5 h-5" />
              Home
            </span>
          </PillowButton>
        </motion.div>
      </div>
    </PageTransition>
  )
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-muted-foreground">Loading results...</div>
        </div>
      }
    >
      <ResultsDashboard />
    </Suspense>
  )
}
