"use client"

import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from "framer-motion"
import { Music, Headphones, Sparkles, Zap, ArrowRight, User, BookOpen, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { PillowButton } from "@/components/maestro/pillow-button"
import { FloatingNotes } from "@/components/maestro/floating-notes"
import { TalkingMascot } from "@/components/maestro/talking-mascot"
import { RemixCard } from "@/components/maestro/remix-card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { getProgress, touchVisit, getLastPracticed } from "@/lib/progress"
import {
  personas,
  instruments,
  songs,
  remixStyles,
  generateMockRemixes,
  generateMockResult,
} from "@/lib/mock-data"
import type { Remix, ArtistInfo, InstrumentInfo } from "@/lib/types"

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
}

function HeroParticles() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: 30 + Math.random() * 60,
    size: 3 + Math.random() * 6,
    color: [
      "var(--maestro-green)",
      "var(--maestro-blue)",
      "var(--maestro-purple)",
      "var(--maestro-gold)",
      "var(--maestro-orange)",
    ][i % 5],
    delay: Math.random() * 6,
    dur: 6 + Math.random() * 8,
    driftX: -40 + Math.random() * 80,
    driftY: -80 - Math.random() * 60,
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full opacity-0"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `particle-drift ${p.dur}s ${p.delay}s ease-in-out infinite`,
            ["--drift-x" as string]: `${p.driftX}px`,
            ["--drift-y" as string]: `${p.driftY}px`,
            ["--drift-x2" as string]: `${-p.driftX}px`,
            ["--drift-y2" as string]: `${p.driftY * 1.5}px`,
          }}
        />
      ))}
    </div>
  )
}

const maestroSpiritPersona = personas.find((p) => p.id === "maestro-spirit") ?? null
const djPersona = personas.find((p) => p.id === "dj-remix") ?? null
const culturalConductorPersona = personas.find((p) => p.id === "cultural-conductor") ?? null

function HomepageMaestroSpirit() {
  const [progress, setProgress] = useState<ReturnType<typeof getProgress> | null>(null)

  useEffect(() => {
    setProgress(getProgress())
    touchVisit()
  }, [])

  const hasStats = (progress?.totalXP ?? 0) > 0 || (progress?.sessionsCompleted ?? 0) > 0
  const message = !hasStats
    ? "Welcome! Pick an instrument and a song — I'll be here when you get back."
    : "Welcome back! Keep it up."

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
      className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 w-full max-w-md"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <TalkingMascot persona={maestroSpiritPersona} size="lg" isSpeaking={false} />
      </motion.div>
      <div className="flex-1 text-left">
        <div
          className="relative px-4 py-3 rounded-2xl rounded-tl-sm sm:rounded-tl-none sm:rounded-bl-sm shadow-lg border border-border"
          style={{ backgroundColor: "var(--maestro-surface)" }}
        >
          <p className="text-sm font-semibold text-foreground">{message}</p>
          {hasStats && progress && (
            <p className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-0">
              <span>{progress.totalXP} XP</span>
              <span>{progress.sessionsCompleted} session{progress.sessionsCompleted !== 1 ? "s" : ""}</span>
              {progress.streakDays > 0 && (
                <span style={{ color: "var(--maestro-gold)" }}>🔥 {progress.streakDays}-day streak</span>
              )}
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 font-medium">
          — Maestro Spirit
        </p>
      </div>
    </motion.div>
  )
}

function BouncingArrow() {
  return (
    <motion.div
      animate={{ y: [0, 6, 0] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <ArrowRight className="w-5 h-5" />
    </motion.div>
  )
}

function StatsBar() {
  const stats = [
    { label: "Instruments", value: "8+", color: "var(--maestro-green)" },
    { label: "Remix Styles", value: "6", color: "var(--maestro-blue)" },
    { label: "AI Feedback", value: "Real-time", color: "var(--maestro-purple)" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, type: "spring", stiffness: 150 }}
      className="flex items-center gap-6 md:gap-10"
    >
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 + i * 0.15, type: "spring", stiffness: 300, damping: 15 }}
        >
          <span className="text-2xl md:text-3xl font-black" style={{ color: s.color }}>
            {s.value}
          </span>
          <span className="text-xs text-muted-foreground font-semibold">{s.label}</span>
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ─── Tutoring Tab ────────────────────────────────────────────── */

type TutoringCategory = "instruments" | "artists" | "songs"

const tutoringCategories: { id: TutoringCategory; label: string; icon: React.ReactNode }[] = [
  { id: "instruments", label: "Instruments", icon: <Music className="w-6 h-6" /> },
  { id: "artists", label: "Artists", icon: <User className="w-6 h-6" /> },
  { id: "songs", label: "Songs", icon: <BookOpen className="w-6 h-6" /> },
]

const uniqueArtists = Array.from(
  new Map(songs.map((s) => [s.artist, s])).values()
).sort((a, b) => a.artist.localeCompare(b.artist))

function TutoringPanel() {
  const [category, setCategory] = useState<TutoringCategory | null>(null)
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null)
  const [claudeInstrument, setClaudeInstrument] = useState<InstrumentInfo | null>(null)
  const [claudeArtist, setClaudeArtist] = useState<ArtistInfo | null>(null)
  const [loadingInstrument, setLoadingInstrument] = useState(false)
  const [loadingArtist, setLoadingArtist] = useState(false)
  const [claudeError, setClaudeError] = useState<string | null>(null)

  const result = useMemo(() => {
    const artistSong = selectedArtist
      ? songs.find((s) => s.artist === selectedArtist)
      : songs[0]
    const sid = selectedSongId ?? artistSong?.id ?? songs[0]?.id
    const iid = selectedInstrumentId ?? "guitar"
    return generateMockResult(sid, iid)
  }, [selectedInstrumentId, selectedArtist, selectedSongId])

  useEffect(() => {
    if (category !== "instruments" || !selectedInstrumentId) {
      setClaudeInstrument(null)
      return
    }
    const inst = instruments.find((i) => i.id === selectedInstrumentId)
    if (!inst) return
    setClaudeError(null)
    setLoadingInstrument(true)
    setClaudeInstrument(null)
    fetch("/api/claude/instrument", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument: inst.name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setClaudeError(data.error); return }
        setClaudeInstrument({
          name: data.name ?? inst.name,
          history: data.history ?? "",
          origin: data.origin ?? inst.origin,
          famousPlayers: Array.isArray(data.famousPlayers) ? data.famousPlayers : [],
          culturalSignificance: data.culturalSignificance ?? "",
        })
      })
      .catch(() => setClaudeError("Could not load feedback"))
      .finally(() => setLoadingInstrument(false))
  }, [category, selectedInstrumentId])

  useEffect(() => {
    if (category !== "artists" || !selectedArtist) {
      setClaudeArtist(null)
      return
    }
    setClaudeError(null)
    setLoadingArtist(true)
    setClaudeArtist(null)
    fetch("/api/claude/artist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artist: selectedArtist }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setClaudeError(data.error); return }
        setClaudeArtist({
          name: data.name ?? selectedArtist,
          bio: data.bio ?? "",
          genre: data.genre ?? "",
          famousSongs: Array.isArray(data.famousSongs) ? data.famousSongs : [],
          influence: data.influence ?? "",
        })
      })
      .catch(() => setClaudeError("Could not load feedback"))
      .finally(() => setLoadingArtist(false))
  }, [category, selectedArtist])

  const showDetail =
    (category === "instruments" && selectedInstrumentId) ||
    (category === "artists" && selectedArtist) ||
    (category === "songs" && selectedSongId)

  function handleBackToList() {
    setSelectedInstrumentId(null)
    setSelectedArtist(null)
    setSelectedSongId(null)
  }

  function handleBackToCategories() {
    setCategory(null)
    handleBackToList()
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center gap-3">
        <TalkingMascot persona={culturalConductorPersona} size="sm" />
        <div>
          <p className="font-bold text-foreground text-sm">Tutoring</p>
          <p className="text-xs text-muted-foreground">Instruments, artists, songs</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!category ? (
          <motion.div
            key="categories"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            {tutoringCategories.map((cat, i) => (
              <motion.button
                key={cat.id}
                type="button"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => setCategory(cat.id)}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border transition-colors cursor-pointer text-center"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: `${culturalConductorPersona?.color ?? "var(--maestro-purple)"}25`,
                    color: culturalConductorPersona?.color ?? "var(--maestro-purple)",
                  }}
                >
                  {cat.icon}
                </div>
                <span className="font-bold text-foreground text-sm">{cat.label}</span>
              </motion.button>
            ))}
          </motion.div>
        ) : !showDetail ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-3"
          >
            <button
              type="button"
              onClick={handleBackToCategories}
              className="text-sm text-muted-foreground hover:text-foreground font-medium w-fit"
            >
              ← Back to categories
            </button>
            <h2 className="text-base font-bold text-foreground">
              {tutoringCategories.find((c) => c.id === category)?.label}
            </h2>
            {category === "instruments" && (
              <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {instruments.map((inst) => (
                  <li key={inst.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedInstrumentId(inst.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${inst.color}25` }}
                      >
                        <Music className="w-4 h-4" style={{ color: inst.color }} />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-foreground text-sm">{inst.name}</p>
                        <p className="text-xs text-muted-foreground">{inst.origin} · {inst.difficulty}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {category === "artists" && (
              <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {uniqueArtists.slice(0, 20).map((s) => (
                  <li key={s.artist}>
                    <button
                      type="button"
                      onClick={() => setSelectedArtist(s.artist)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-maestro-surface-hover flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-foreground text-sm">{s.artist}</p>
                        <p className="text-xs text-muted-foreground">{s.genre}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {category === "songs" && (
              <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {songs.slice(0, 20).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSongId(s.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-maestro-surface-hover flex items-center justify-center shrink-0">
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm truncate">{s.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.artist} · {s.difficulty}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col gap-4"
          >
            <button
              type="button"
              onClick={handleBackToList}
              className="text-sm text-muted-foreground hover:text-foreground font-medium w-fit"
            >
              ← Back to list
            </button>

            {category === "instruments" && (
              <div className="rounded-2xl bg-maestro-surface border border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="text-lg font-black text-foreground">
                    {(claudeInstrument ?? result.instrumentInfo).name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {(claudeInstrument ?? result.instrumentInfo).origin}
                  </p>
                  {loadingInstrument && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Getting feedback from Claude…
                    </p>
                  )}
                  {claudeError && !loadingInstrument && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      {claudeError} — showing default info.
                    </p>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">History</h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {(claudeInstrument ?? result.instrumentInfo).history}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">Cultural significance</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {(claudeInstrument ?? result.instrumentInfo).culturalSignificance}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">Famous players</h3>
                    <ul className="flex flex-wrap gap-2">
                      {(claudeInstrument ?? result.instrumentInfo).famousPlayers.map((p, i) => (
                        <li key={i} className="text-xs px-2.5 py-1 rounded-full bg-maestro-surface-hover text-foreground">{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {category === "artists" && (
              <div className="rounded-2xl bg-maestro-surface border border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="text-lg font-black text-foreground">
                    {(claudeArtist ?? result.artistInfo).name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {(claudeArtist ?? result.artistInfo).genre}
                  </p>
                  {loadingArtist && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Getting feedback from Claude…
                    </p>
                  )}
                  {claudeError && !loadingArtist && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      {claudeError} — showing default info.
                    </p>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">Bio</h3>
                    <p className="text-sm text-foreground leading-relaxed">
                      {(claudeArtist ?? result.artistInfo).bio}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">Influence</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {(claudeArtist ?? result.artistInfo).influence}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">Notable works</h3>
                    <div className="flex flex-wrap gap-2">
                      {(claudeArtist ?? result.artistInfo).famousSongs.map((name, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-maestro-surface-hover text-foreground">{name}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {category === "songs" && (
              <div className="rounded-2xl bg-maestro-surface border border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="text-lg font-black text-foreground">
                    {result.songAnalysis.key} · {result.songAnalysis.tempo} BPM
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Time signature {result.songAnalysis.timeSignature} · Chords{" "}
                    {result.songAnalysis.chordProgression.join(" - ")}
                  </p>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">Musical elements</h3>
                    <ul className="list-disc list-inside text-sm text-foreground space-y-0.5">
                      {result.songAnalysis.musicalElements.map((el, i) => (
                        <li key={i}>{el}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-1">Mood</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {result.songAnalysis.moodDescription}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── AI Remixes Tab ──────────────────────────────────────────── */

function RemixesPanel() {
  const [lastPracticed, setLastPracticed] = useState<ReturnType<typeof getLastPracticed>>([])
  const [selectedEntry, setSelectedEntry] = useState<{ songId: string; instrumentId: string } | null>(null)
  const [remixes, setRemixes] = useState<Remix[]>([])
  const [generating, setGenerating] = useState(false)
  const [playingRemixId, setPlayingRemixId] = useState<string | null>(null)

  useEffect(() => {
    setLastPracticed(getLastPracticed())
  }, [])

  const selectedSong = selectedEntry ? songs.find((s) => s.id === selectedEntry.songId) : null
  const selectedInstrument = selectedEntry ? instruments.find((i) => i.id === selectedEntry.instrumentId) : null

  async function handleGenerateRemixes() {
    if (!selectedEntry) return
    setGenerating(true)
    await new Promise((r) => setTimeout(r, 1500))
    setRemixes(generateMockRemixes(djPersona?.id))
    setGenerating(false)
  }

  function clearSelection() {
    setSelectedEntry(null)
    setRemixes([])
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex items-center gap-3">
        <TalkingMascot persona={djPersona} size="sm" />
        <div>
          <p className="font-bold text-foreground text-sm">AI Remixes</p>
          <p className="text-xs text-muted-foreground">Pick a song — create Juno remixes</p>
        </div>
      </div>

      {!selectedEntry ? (
        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">
            Last songs you practiced
          </h2>
          {lastPracticed.length === 0 ? (
            <div className="py-8 rounded-2xl bg-maestro-surface border border-border text-center">
              <Music className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground font-medium text-sm">No practice history yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Play a song from Pick & Play to see it here
              </p>
              <Link href="/select">
                <PillowButton size="sm" className="mt-3">
                  Pick & Play
                </PillowButton>
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {lastPracticed.map((entry, i) => {
                const song = songs.find((s) => s.id === entry.songId)
                const instrument = instruments.find((ins) => ins.id === entry.instrumentId)
                if (!song) return null
                return (
                  <motion.li
                    key={`${entry.songId}-${entry.instrumentId}-${entry.practicedAt}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedEntry({ songId: entry.songId, instrumentId: entry.instrumentId })}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${instrument?.color ?? "var(--maestro-purple)"}25` }}
                      >
                        <Music className="w-4 h-4" style={{ color: instrument?.color ?? "var(--maestro-purple)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-sm truncate">{song.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {song.artist}{instrument && ` · ${instrument.name}`}
                        </p>
                      </div>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-maestro-purple/20 text-maestro-purple shrink-0">
                        Remix
                      </span>
                    </button>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </section>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between flex-wrap gap-3"
          >
            <div>
              <p className="text-xs text-muted-foreground">Selected</p>
              <p className="font-bold text-foreground text-sm">
                {selectedSong?.title} — {selectedSong?.artist}
              </p>
              {selectedInstrument && (
                <p className="text-xs font-medium" style={{ color: selectedInstrument.color }}>
                  {selectedInstrument.name}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              Change song
            </button>
          </motion.div>

          {remixes.length === 0 ? (
            <div className="py-8 rounded-2xl bg-maestro-surface border border-border flex flex-col items-center gap-3">
              <p className="text-foreground font-medium text-sm">Generate AI remixes with Juno</p>
              <p className="text-xs text-muted-foreground text-center max-w-sm">
                Styles: {remixStyles.map((s) => s.name).join(", ")}
              </p>
              <PillowButton
                size="md"
                color="var(--maestro-purple)"
                darkColor="#A866CC"
                onClick={handleGenerateRemixes}
                disabled={generating}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  {generating ? "Generating…" : "Generate with Juno"}
                </span>
              </PillowButton>
            </div>
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-bold text-foreground">Your Juno remixes</h2>
              <div className="flex gap-3 overflow-x-auto pb-3 -mx-2 px-2">
                {remixes.map((remix, i) => (
                  <RemixCard
                    key={remix.id}
                    remix={remix}
                    persona={djPersona}
                    isPlaying={playingRemixId === remix.id}
                    onTogglePlay={() => setPlayingRemixId(playingRemixId === remix.id ? null : remix.id)}
                    index={i}
                  />
                ))}
              </div>
              <PillowButton
                size="sm"
                color="var(--maestro-purple)"
                darkColor="#A866CC"
                onClick={handleGenerateRemixes}
                disabled={generating}
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  Generate more styles
                </span>
              </PillowButton>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* ─── Main Page ───────────────────────────────────────────────── */

function HomeDashboardInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const defaultTab = tabParam === "remixes" ? "remixes" : "tutoring"

  const [showCtaGlow, setShowCtaGlow] = useState(false)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const springX = useSpring(mouseX, { stiffness: 50, damping: 20 })
  const springY = useSpring(mouseY, { stiffness: 50, damping: 20 })
  const bgX = useTransform(springX, [0, 1], [-15, 15])
  const bgY = useTransform(springY, [0, 1], [-15, 15])

  useEffect(() => {
    const timer = setTimeout(() => setShowCtaGlow(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  function handleMouseMove(e: React.MouseEvent) {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseX.set((e.clientX - rect.left) / rect.width)
    mouseY.set((e.clientY - rect.top) / rect.height)
  }

  return (
    <main
      className="relative min-h-screen flex flex-col items-center overflow-hidden bg-background"
      onMouseMove={handleMouseMove}
    >
      <FloatingNotes />
      <HeroParticles />

      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ x: bgX, y: bgY }}
        aria-hidden="true"
      >
        <div
          className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-[120px] opacity-30"
          style={{ backgroundColor: "var(--maestro-green)" }}
        />
        <div
          className="absolute bottom-1/3 right-1/4 w-64 h-64 rounded-full blur-[100px] opacity-25"
          style={{ backgroundColor: "var(--maestro-blue)" }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-48 h-48 rounded-full blur-[80px] opacity-20"
          style={{ backgroundColor: "var(--maestro-purple)" }}
        />
      </motion.div>

      {/* ─── Hero Section ─── */}
      <div className="relative z-10 flex flex-col items-center gap-8 px-6 pt-16 pb-8 max-w-2xl text-center">
        <HomepageMaestroSpirit />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 18, delay: 0.25 }}
          className="flex flex-col items-center gap-3"
        >
          <h1 className="text-5xl md:text-7xl font-black text-balance tracking-tight text-gradient-animated">
            Maestro
          </h1>
          <motion.p
            className="text-xl md:text-2xl font-bold text-muted-foreground text-pretty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Learn. Play. Remix.
          </motion.p>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-base text-muted-foreground leading-relaxed max-w-md"
        >
          Pick your instrument, play your favorite song, and let AI remix your
          performance into entirely new styles. Then dive deep into technique,
          artist history, and music theory.
        </motion.p>

        <StatsBar />

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.7, type: "spring", stiffness: 200 }}
          className={showCtaGlow ? "animate-disco-glow rounded-2xl" : ""}
        >
          <Link href="/select">
            <PillowButton size="lg">
              <span className="flex items-center gap-2">
                Start Playing
                <BouncingArrow />
              </span>
            </PillowButton>
          </Link>
        </motion.div>
      </div>

      {/* ─── Tabs: Tutoring & AI Remixes ─── */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, type: "spring", stiffness: 150, damping: 20 }}
        className="relative z-10 w-full max-w-2xl px-6 pb-16"
      >
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full h-12 rounded-2xl bg-maestro-surface border border-border p-1">
            <TabsTrigger
              value="tutoring"
              className="flex-1 h-full rounded-xl text-sm font-bold gap-2 data-[state=active]:bg-maestro-gold/20 data-[state=active]:text-maestro-gold data-[state=active]:shadow-none transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Tutoring
            </TabsTrigger>
            <TabsTrigger
              value="remixes"
              className="flex-1 h-full rounded-xl text-sm font-bold gap-2 data-[state=active]:bg-maestro-purple/20 data-[state=active]:text-maestro-purple data-[state=active]:shadow-none transition-all"
            >
              <Headphones className="w-4 h-4" />
              AI Remixes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tutoring" className="mt-6">
            <TutoringPanel />
          </TabsContent>

          <TabsContent value="remixes" className="mt-6">
            <RemixesPanel />
          </TabsContent>
        </Tabs>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="relative z-10 text-xs text-muted-foreground flex items-center gap-1.5 pb-8"
      >
        <Zap className="w-3 h-3" style={{ color: "var(--maestro-gold)" }} />
        Powered by Suno AI, OpenAI & NVIDIA
      </motion.p>
    </main>
  )
}

export default function HomeDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <HomeDashboardInner />
    </Suspense>
  )
}
