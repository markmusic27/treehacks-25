"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ChevronDown,
  Lightbulb,
  User,
  Music,
  BarChart3,
} from "lucide-react"
import type { PerformanceResult, Persona } from "@/lib/types"
import { cn } from "@/lib/utils"
import { TalkingMascot } from "./talking-mascot"

interface TutorPanelProps {
  result: PerformanceResult
  /** Persona (animated character) delivering the feedback; uses Maestro Spirit style if null. */
  persona?: Persona | null
}

interface SectionProps {
  title: string
  icon: React.ReactNode
  color: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function TypewriterText({
  text,
  speed = 15,
  onSpeakingChange,
}: {
  text: string
  speed?: number
  onSpeakingChange?: (isSpeaking: boolean) => void
}) {
  const [displayed, setDisplayed] = useState("")

  useEffect(() => {
    setDisplayed("")
    onSpeakingChange?.(true)
    let i = 0
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1))
      i++
      if (i >= text.length) {
        clearInterval(interval)
        onSpeakingChange?.(false)
      }
    }, speed)
    return () => {
      clearInterval(interval)
      onSpeakingChange?.(false)
    }
  }, [text, speed, onSpeakingChange])

  return <span>{displayed}</span>
}

function AccordionSection({
  title,
  icon,
  color,
  children,
  defaultOpen = false,
}: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-2xl overflow-hidden bg-maestro-surface">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 hover:bg-maestro-surface-hover transition-colors cursor-pointer"
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}25` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <span className="font-bold text-foreground flex-1 text-left">
          {title}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TutorPanel({ result, persona }: TutorPanelProps) {
  const [activeTutor, setActiveTutor] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setActiveTutor(true), 500)
    return () => clearTimeout(timer)
  }, [])

  const tutorName = persona?.name ?? "Maestro AI Tutor"

  return (
    <div className="flex flex-col gap-4">
      {/* Animated character (persona) + feedback intro */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3 p-4 rounded-2xl bg-maestro-surface"
      >
        <TalkingMascot
          persona={persona}
          size="sm"
          isSpeaking={isSpeaking}
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground text-sm mb-1">
            {tutorName}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {activeTutor ? (
              <TypewriterText
                text={result.technique.summary}
                speed={12}
                onSpeakingChange={setIsSpeaking}
              />
            ) : (
              "Analyzing your performance..."
            )}
          </p>
        </div>
      </motion.div>

      {/* Accordion Sections */}
      <AccordionSection
        title="Technique Feedback"
        icon={<Lightbulb className="w-5 h-5" />}
        color="var(--maestro-green)"
        defaultOpen
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Strengths
            </p>
            <ul className="flex flex-col gap-1.5">
              {result.technique.strengths.map((s, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <span style={{ color: "var(--maestro-green)" }}>+</span>
                  {s}
                </motion.li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Tips to Improve
            </p>
            <ul className="flex flex-col gap-1.5">
              {result.technique.tips.map((t, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className={cn(
                    "flex items-start gap-2 text-sm text-foreground"
                  )}
                >
                  <span style={{ color: "var(--maestro-orange)" }}>*</span>
                  {t}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Artist Background"
        icon={<User className="w-5 h-5" />}
        color="var(--maestro-purple)"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground leading-relaxed">
            {result.artistInfo.bio}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.artistInfo.influence}
          </p>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Notable Works
            </p>
            <div className="flex flex-wrap gap-2">
              {result.artistInfo.famousSongs.map((s, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 rounded-full bg-maestro-surface-hover text-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Instrument Deep Dive"
        icon={<Music className="w-5 h-5" />}
        color="var(--maestro-orange)"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground leading-relaxed">
            {result.instrumentInfo.history}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.instrumentInfo.culturalSignificance}
          </p>
        </div>
      </AccordionSection>

      <AccordionSection
        title="Song Analysis"
        icon={<BarChart3 className="w-5 h-5" />}
        color="var(--maestro-blue)"
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-maestro-surface-hover">
              <p className="text-xs text-muted-foreground">Key</p>
              <p className="font-bold text-foreground">
                {result.songAnalysis.key}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-maestro-surface-hover">
              <p className="text-xs text-muted-foreground">Tempo</p>
              <p className="font-bold text-foreground">
                {result.songAnalysis.tempo} BPM
              </p>
            </div>
            <div className="p-3 rounded-xl bg-maestro-surface-hover">
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="font-bold text-foreground">
                {result.songAnalysis.timeSignature}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-maestro-surface-hover">
              <p className="text-xs text-muted-foreground">Chords</p>
              <p className="font-bold text-foreground text-sm">
                {result.songAnalysis.chordProgression.join(" - ")}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {result.songAnalysis.moodDescription}
          </p>
        </div>
      </AccordionSection>
    </div>
  )
}
