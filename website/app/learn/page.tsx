"use client"

import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, Music, User, BookOpen, Loader2 } from "lucide-react"
import Link from "next/link"
import { PageTransition } from "@/components/maestro/page-transition"
import { TalkingMascot } from "@/components/maestro/talking-mascot"
import {
  instruments,
  songs,
  personas,
  generateMockResult,
} from "@/lib/mock-data"
import type { ArtistInfo, InstrumentInfo } from "@/lib/types"

const culturalConductorPersona = personas.find(
  (p) => p.id === "cultural-conductor"
) ?? null

type Category = "instruments" | "artists" | "songs"

const categories: { id: Category; label: string; icon: React.ReactNode }[] = [
  { id: "instruments", label: "Instruments", icon: <Music className="w-6 h-6" /> },
  { id: "artists", label: "Artists", icon: <User className="w-6 h-6" /> },
  { id: "songs", label: "Songs", icon: <BookOpen className="w-6 h-6" /> },
]

const uniqueArtists = Array.from(
  new Map(songs.map((s) => [s.artist, s])).values()
).sort((a, b) => a.artist.localeCompare(b.artist))

export default function LearnPage() {
  const [category, setCategory] = useState<Category | null>(null)
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null)
  const [claudeInstrument, setClaudeInstrument] = useState<InstrumentInfo | null>(null)
  const [claudeArtist, setClaudeArtist] = useState<ArtistInfo | null>(null)
  const [loadingInstrument, setLoadingInstrument] = useState(false)
  const [loadingArtist, setLoadingArtist] = useState(false)
  const [claudeError, setClaudeError] = useState<string | null>(null)

  const result = useMemo(() => {
    const songId = selectedSongId ?? songs[0]?.id
    const artistSong = selectedArtist
      ? songs.find((s) => s.artist === selectedArtist)
      : songs[0]
    const sid = selectedSongId ?? artistSong?.id ?? songs[0]?.id
    const iid = selectedInstrumentId ?? "guitar"
    return generateMockResult(sid, iid)
  }, [selectedInstrumentId, selectedArtist, selectedSongId])

  // Fetch Claude feedback for instrument when one is selected
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
        if (data.error) {
          setClaudeError(data.error)
          return
        }
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

  // Fetch Claude feedback for artist when one is selected
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
        if (data.error) {
          setClaudeError(data.error)
          return
        }
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

  const showList = category !== null && !selectedInstrumentId && !selectedArtist && !selectedSongId
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
    <PageTransition className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-maestro-surface transition-colors"
            aria-label="Back to home"
          >
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <TalkingMascot persona={culturalConductorPersona} size="md" />
            <div>
              <h1 className="text-2xl font-black text-foreground">
                Learn & Grow
              </h1>
              <p className="text-sm text-muted-foreground">
                Tutoring: instruments, artists, songs
              </p>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!category ? (
            <motion.div
              key="categories"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              {categories.map((cat, i) => (
                <motion.button
                  key={cat.id}
                  type="button"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => setCategory(cat.id)}
                  className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border transition-colors cursor-pointer text-center"
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `${culturalConductorPersona?.color ?? "var(--maestro-purple)"}25`,
                      color: culturalConductorPersona?.color ?? "var(--maestro-purple)",
                    }}
                  >
                    {cat.icon}
                  </div>
                  <span className="font-bold text-foreground">{cat.label}</span>
                </motion.button>
              ))}
            </motion.div>
          ) : !showDetail ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-4"
            >
              <button
                type="button"
                onClick={handleBackToCategories}
                className="text-sm text-muted-foreground hover:text-foreground font-medium w-fit"
              >
                ← Back to categories
              </button>
              <h2 className="text-lg font-bold text-foreground">
                {categories.find((c) => c.id === category)?.label}
              </h2>
              {category === "instruments" && (
                <ul className="flex flex-col gap-2">
                  {instruments.map((inst) => (
                    <li key={inst.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedInstrumentId(inst.id)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${inst.color}25`,
                          }}
                        >
                          <Music className="w-5 h-5" style={{ color: inst.color }} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-foreground">{inst.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {inst.origin} · {inst.difficulty}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {category === "artists" && (
                <ul className="flex flex-col gap-2">
                  {uniqueArtists.map((s) => (
                    <li key={s.artist}>
                      <button
                        type="button"
                        onClick={() => setSelectedArtist(s.artist)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-maestro-surface-hover flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-foreground">{s.artist}</p>
                          <p className="text-sm text-muted-foreground">{s.genre}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {category === "songs" && (
                <ul className="flex flex-col gap-2">
                  {songs.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedSongId(s.id)}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-maestro-surface-hover flex items-center justify-center shrink-0">
                          <BookOpen className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground truncate">
                            {s.title}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {s.artist} · {s.difficulty}
                          </p>
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
              className="flex flex-col gap-6"
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
                    <h2 className="text-xl font-black text-foreground">
                      {(claudeInstrument ?? result.instrumentInfo).name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
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
                  <div className="p-4 flex flex-col gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        History
                      </h3>
                      <p className="text-foreground leading-relaxed">
                        {(claudeInstrument ?? result.instrumentInfo).history}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        Cultural significance
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">
                        {(claudeInstrument ?? result.instrumentInfo).culturalSignificance}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        Famous players
                      </h3>
                      <ul className="flex flex-wrap gap-2">
                        {(claudeInstrument ?? result.instrumentInfo).famousPlayers.map((p, i) => (
                          <li
                            key={i}
                            className="text-sm px-3 py-1.5 rounded-full bg-maestro-surface-hover text-foreground"
                          >
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {category === "artists" && (
                <div className="rounded-2xl bg-maestro-surface border border-border overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h2 className="text-xl font-black text-foreground">
                      {(claudeArtist ?? result.artistInfo).name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
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
                  <div className="p-4 flex flex-col gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        Bio
                      </h3>
                      <p className="text-foreground leading-relaxed">
                        {(claudeArtist ?? result.artistInfo).bio}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        Influence
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">
                        {(claudeArtist ?? result.artistInfo).influence}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        Notable works
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(claudeArtist ?? result.artistInfo).famousSongs.map((name, i) => (
                          <span
                            key={i}
                            className="text-sm px-3 py-1.5 rounded-full bg-maestro-surface-hover text-foreground"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {category === "songs" && (
                <div className="rounded-2xl bg-maestro-surface border border-border overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h2 className="text-xl font-black text-foreground">
                      {result.songAnalysis.key} · {result.songAnalysis.tempo} BPM
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Time signature {result.songAnalysis.timeSignature} · Chords{" "}
                      {result.songAnalysis.chordProgression.join(" - ")}
                    </p>
                  </div>
                  <div className="p-4 flex flex-col gap-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        Musical elements
                      </h3>
                      <ul className="list-disc list-inside text-foreground space-y-1">
                        {result.songAnalysis.musicalElements.map((el, i) => (
                          <li key={i}>{el}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">
                        Mood
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">
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
    </PageTransition>
  )
}
